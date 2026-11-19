import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MockModelAdapter } from '@jc/agents';
import { claimTask, createTask } from '@jc/db';
import { MorningBriefSchema, zonedTimeToUtc } from '@jc/domain';
import { DEMO_WORKSPACE_ID } from '../../packages/db/src/seed-lib';
import { processTask } from '../../apps/worker/src/tasks';
import { runSchedulerTick } from '../../apps/worker/src/scheduler';
import { runWatchdogTick } from '../../apps/worker/src/watchdog';
import { advanceMeetings } from '../../apps/worker/src/meetings';
import { deps, resetAndSeed, testDb } from './helpers';

const db = testDb();
const ws = DEMO_WORKSPACE_ID;

async function drain(d = deps(db)) {
  // Simuleert de dispatcher: verwerk alles wat claimbaar is tot er niets meer is.
  for (let i = 0; i < 10; i++) {
    const q = await db.task.findMany({ where: { status: 'queued' } });
    if (!q.length) return;
    for (const t of q) await processTask(d, t.id);
  }
}

beforeEach(async () => {
  await resetAndSeed(db);
});
afterAll(async () => {
  await db.$disconnect();
});

describe('ochtendbrief: queue → Analyst → evidence → Lead → opgeslagen resultaat', () => {
  it('levert een schema-geldige brief met max. 3 prioriteiten en bestaand bewijs', async () => {
    const t = await createTask(db, { workspaceId: ws, type: 'morning_brief', title: 'Ochtendbrief', agentRole: 'lead', isDemo: true });
    await drain();
    const done = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(done.status, done.failureReason ?? '').toBe('succeeded');
    expect(done.attempts).toBe(1); // hervatten na deeltaak is geen nieuwe poging
    const art = await db.artifact.findUniqueOrThrow({ where: { id: done.resultArtifactId! } });
    const brief = MorningBriefSchema.parse(art.content);
    expect(brief.priorities.length).toBeGreaterThan(0);
    expect(brief.priorities.length).toBeLessThanOrEqual(3);
    expect(brief.isDemo).toBe(true);
    expect(brief.missingData.join(' ')).toMatch(/Conversieratio|Bijdragemarge/);
    // Elke numerieke finding verwijst naar een opgeslagen metricsnapshot met dezelfde waarde.
    for (const f of brief.facts.filter((x) => typeof x.value === 'number')) {
      const ref = f.evidence.find((e) => e.kind === 'metric_snapshot')!;
      const snap = await db.metricSnapshot.findUniqueOrThrow({ where: { id: ref.id } });
      expect(snap.value).toBe(f.value);
    }
    const child = await db.task.findFirstOrThrow({ where: { parentTaskId: t.id } });
    expect(child.agentRole).toBe('analyst');
    expect(child.status).toBe('succeeded');
    const runs = await db.agentRun.findMany({ where: { taskId: { in: [t.id, child.id] } } });
    expect(runs.map((r) => r.modelProvider)).toEqual(['mock', 'mock']);
    const events = await db.officeEvent.findMany({ where: { taskId: t.id }, orderBy: { id: 'asc' } });
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['task.created', 'task.started', 'task.blocked', 'task.queued', 'task.succeeded']));
  });

  it('faalt leesbaar na één mislukte herstelpoging en registreert de reden', async () => {
    const t = await createTask(db, { workspaceId: ws, type: 'commerce_analysis', title: 'Analyse', agentRole: 'analyst', isDemo: true });
    await processTask(deps(db, { adapter: new MockModelAdapter({ invalidFirst: 2 }) }), t.id);
    const r = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(r.status).toBe('failed');
    expect(r.failureReason).toMatch(/herstelpoging/);
  });

  it('herstelt met één gerichte herstelpoging als de eerste uitvoer ongeldig is', async () => {
    const t = await createTask(db, { workspaceId: ws, type: 'commerce_analysis', title: 'Analyse', agentRole: 'analyst', isDemo: true });
    await processTask(deps(db, { adapter: new MockModelAdapter({ invalidFirst: 1 }) }), t.id);
    const r = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(r.status).toBe('succeeded');
    const run = await db.agentRun.findFirstOrThrow({ where: { taskId: t.id } });
    expect(run.repairAttempted).toBe(true);
  });
});

describe('duurzaamheid en geen dubbele uitvoering', () => {
  it('een taak kan maar door één worker tegelijk geclaimd worden', async () => {
    const t = await createTask(db, { workspaceId: ws, type: 'commerce_analysis', title: 'A', agentRole: 'analyst' });
    const [a, b] = await Promise.all([claimTask(db, t.id, 'w1'), claimTask(db, t.id, 'w2')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it('na workercrash (verlopen lease) neemt een nieuwe worker over; na max pogingen faalt de taak zonder eindeloze retry', async () => {
    const t = await createTask(db, { workspaceId: ws, type: 'commerce_analysis', title: 'A', agentRole: 'analyst', maxAttempts: 2 });
    await claimTask(db, t.id, 'dead-worker');
    await db.task.update({ where: { id: t.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    // Lease nog geldig voor ander → niet claimbaar; verlopen → wel.
    await processTask(deps(db, { workerId: 'new-worker' }), t.id);
    const r = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(r.status).toBe('succeeded');
    expect(r.attempts).toBe(2);

    const t2 = await createTask(db, { workspaceId: ws, type: 'commerce_analysis', title: 'B', agentRole: 'analyst', maxAttempts: 1 });
    await claimTask(db, t2.id, 'dead-worker');
    await db.task.update({ where: { id: t2.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
    expect(await claimTask(db, t2.id, 'new-worker')).toBeNull();
    expect((await db.task.findUniqueOrThrow({ where: { id: t2.id } })).status).toBe('failed');
  });

  it('een geannuleerde taak wordt niet meer uitgevoerd', async () => {
    const t = await createTask(db, { workspaceId: ws, type: 'commerce_analysis', title: 'A', agentRole: 'analyst' });
    await db.task.update({ where: { id: t.id }, data: { status: 'cancelled' } });
    expect(await processTask(deps(db), t.id)).toBe('not_claimed');
  });
});

describe('vergaderingen', () => {
  it('drie dagelijkse vergaderingen leveren elk precies één verslag, ook bij herhaalde ticks/herstart', async () => {
    // Werkdag woensdag 2026-11-18, Europe/Amsterdam
    const day = (h: number, m: number) => zonedTimeToUtc(2026, 11, 18, h, m, 'Europe/Amsterdam');
    for (const [h, m] of [[9, 1], [9, 2], [13, 0], [13, 5], [16, 31], [16, 31]] as const) {
      await runSchedulerTick(deps(db), day(h, m));
      await runSchedulerTick(deps(db), day(h, m)); // tweede worker / herstart op hetzelfde moment
    }
    const meetings = await db.meeting.findMany({ where: { workspaceId: ws } });
    expect(meetings.map((x) => x.scheduleKey).sort()).toEqual(['meeting_close', 'meeting_progress', 'meeting_standup']);
    for (const m of meetings) {
      expect(await db.meetingUpdate.count({ where: { meetingId: m.id } })).toBe(6);
      expect(m.synthesis).not.toBeNull();
      expect((m.synthesis as { externalWritesAuthorized: boolean }).externalWritesAuthorized).toBe(false);
    }
  });

  it('na uitval wordt alleen het laatste gemiste overleg ingehaald, gelabeld als verlaat', async () => {
    const t = zonedTimeToUtc(2026, 11, 18, 17, 10, 'Europe/Amsterdam'); // 09:00, 13:00, 16:30 gemist
    await runSchedulerTick(deps(db), t);
    const meetings = await db.meeting.findMany({ where: { workspaceId: ws } });
    expect(meetings).toHaveLength(1);
    expect(meetings[0]!.scheduleKey).toBe('meeting_close');
    expect(meetings[0]!.late).toBe(true);
    expect(meetings[0]!.title).toMatch(/verlaat/);
  });

  it('updates verwijzen naar echte taken; agent zonder werk zegt dat eerlijk', async () => {
    const task = await createTask(db, { workspaceId: ws, type: 'morning_brief', title: 'Ochtendbrief', agentRole: 'lead', isDemo: true });
    await drain();
    await runSchedulerTick(deps(db), zonedTimeToUtc(2026, 11, 18, 9, 1, 'Europe/Amsterdam'));
    const m = await db.meeting.findFirstOrThrow({ include: { updates: true } });
    const lead = m.updates.find((u) => u.agentRole === 'lead')!;
    expect((lead.done as { taskId: string }[]).map((d) => d.taskId)).toContain(task.id);
    expect(m.updates.find((u) => u.agentRole === 'growth')!.text).toMatch(/niet geactiveerd/);
    await advanceMeetings(deps(db), new Date(Date.now() + 5000));
    expect((await db.meeting.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('completed');
  });
});

describe('watchdog (hond)', () => {
  it('alarmeert bij stagnatie met de echte oorzaak, en niet bij normale inactiviteit of rate limit', async () => {
    const stalled = await createTask(db, { workspaceId: ws, type: 'demo_stall', title: 'Demo vastgelopen', agentRole: 'growth', isDemo: true });
    const limited = await createTask(db, { workspaceId: ws, type: 'demo_rate_limit', title: 'Demo rate limit', agentRole: 'retention', isDemo: true });
    const now = new Date();
    await db.task.update({ where: { id: stalled.id }, data: { status: 'running', startedAt: new Date(now.getTime() - 120e3), heartbeatAt: now, progressAt: new Date(now.getTime() - 120e3), progressNote: 'wacht op Meta-API' } });
    await db.task.update({ where: { id: limited.id }, data: { status: 'running', startedAt: new Date(now.getTime() - 120e3), heartbeatAt: now, progressAt: new Date(now.getTime() - 120e3), rateLimitUntil: new Date(now.getTime() + 60e3) } });
    const r = await runWatchdogTick(deps(db), now);
    expect(r.opened).toBe(1);
    const alerts = await db.watchdogAlert.findMany();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.taskId).toBe(stalled.id);
    expect(alerts[0]!.agentRole).toBe('growth');
    expect(alerts[0]!.cause).toMatch(/geen voortgang.*Meta-API/);
    // Cooldown/dedup: tweede tick maakt geen extra alarm.
    expect((await runWatchdogTick(deps(db), now)).opened).toBe(0);
    // De watchdog wijzigt de taak niet (geen succesclaim, geen retry).
    expect((await db.task.findUniqueOrThrow({ where: { id: stalled.id } })).status).toBe('running');
    // Herstel: voortgang → alarm krijgt herstelstatus.
    await db.task.update({ where: { id: stalled.id }, data: { progressAt: new Date() } });
    expect((await runWatchdogTick(deps(db), new Date())).recovered).toBe(1);
  });

  it('geen alarmen bij een rustig kantoor zonder taken', async () => {
    const r = await runWatchdogTick(deps(db));
    expect(r.opened).toBe(0);
  });
});
