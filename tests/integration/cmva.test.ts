import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { CmvaClient, CmvaSummarySchema } from '@jc/connectors';
import { configureCmvaSync, createTask, storeCmvaSummary } from '@jc/db';
import { DEMO_WORKSPACE_ID as ws } from '../../packages/db/src/seed-lib';
import { cmvaFixture } from '../../packages/connectors/test/fixtures/cmva-summary';
import { syncCmva } from '../../apps/worker/src/cmva-sync';
import { runSchedulerTick } from '../../apps/worker/src/scheduler';
import { processTask } from '../../apps/worker/src/tasks';
import { deps, resetAndSeed, testDb } from './helpers';

const db = testDb();
const profile = 'test-shop';
const fixture = () => CmvaSummarySchema.parse(structuredClone(cmvaFixture));
const client = (status = 200) =>
  new CmvaClient(
    { base: 'https://cmva.invalid', profile, token: 'synthetic-test-credential' },
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(cmvaFixture), { status })),
  );
beforeEach(async () => {
  await resetAndSeed(db);
});
afterAll(async () => {
  await db.$disconnect();
  vi.unstubAllEnvs();
});

it('upserts without duplicate records, isolates workspaces and preserves EUR cents/year/source metadata', async () => {
  const time = new Date('2027-01-01T01:00:00Z');
  await storeCmvaSummary(db, ws, profile, fixture(), time, true);
  const updated = fixture();
  updated.stores[0]!.per_day[0]!.revenue_eur = 99.99;
  updated.stores[0]!.per_day[0]!.roas = null;
  await storeCmvaSummary(db, ws, profile, updated, time, true);
  expect(await db.cmvaDailyMetric.count({ where: { workspaceId: ws } })).toBe(18);
  const revenue = await db.cmvaDailyMetric.findFirstOrThrow({
    where: { workspaceId: ws, storeProfile: profile, dateLocal: '2026-12-31', metric: 'revenue_eur' },
  });
  expect(revenue).toMatchObject({
    valueMinor: 9999n,
    sourceCurrency: 'EUR',
    fetchedAt: time,
    isDemo: true,
    sourceTimezone: 'Australia/Sydney',
  });
  expect(revenue.sourceVersion).toContain('27492f');
  expect(
    (
      await db.cmvaDailyMetric.findFirstOrThrow({
        where: { workspaceId: ws, dateLocal: '2026-12-31', metric: 'roas' },
      })
    ).valueMinor,
  ).toBeNull();
  await db.workspace.create({ data: { id: 'cmva-other', name: 'Demo other', isDemo: true } });
  await storeCmvaSummary(db, 'cmva-other', profile, fixture(), time, true);
  expect(await db.cmvaDailyMetric.count({ where: { workspaceId: 'cmva-other' } })).toBe(18);
  expect(await db.cmvaDailyMetric.count({ where: { workspaceId: ws } })).toBe(18);
});

it('records fixture syncs as demo, never connected; failures contain only safe classifications', async () => {
  await configureCmvaSync(db, ws, profile);
  await syncCmva(db, ws, client(), true);
  expect(
    await db.connection.findUniqueOrThrow({
      where: { workspaceId_provider: { workspaceId: ws, provider: 'cmva' } },
    }),
  ).toMatchObject({ status: 'demo_not_connected', isDemo: true, lastProbeOk: false });
  await expect(syncCmva(db, ws, client(401), true)).rejects.toMatchObject({ kind: 'auth' });
  const connection = await db.connection.findUniqueOrThrow({
    where: { workspaceId_provider: { workspaceId: ws, provider: 'cmva' } },
  });
  expect(connection).toMatchObject({ status: 'action_required', lastProbeOk: false });
  expect(connection.lastError).not.toContain('synthetic-test-credential');
  expect(
    await db.syncRun.count({ where: { workspaceId: ws, provider: 'cmva', status: 'failed', isDemo: true } }),
  ).toBe(1);
});

it('creates only one hourly task on concurrent ticks, skips backlog and respects disabled schedule and emergency stop', async () => {
  await configureCmvaSync(db, ws, profile);
  await configureCmvaSync(db, ws, profile);
  const d = deps(db);
  const first = new Date('2027-01-02T00:01:00Z');
  await Promise.all([runSchedulerTick(d, first), runSchedulerTick(d, first)]);
  const tasks = () => db.task.findMany({ where: { workspaceId: ws, type: 'cmva_sync' } });
  expect(await tasks()).toHaveLength(1);
  await db.task.updateMany({ where: { workspaceId: ws, type: 'cmva_sync' }, data: { status: 'succeeded' } });
  await runSchedulerTick(d, new Date('2027-01-03T12:05:00Z'));
  expect(await tasks()).toHaveLength(2);
  await runSchedulerTick(d, new Date('2027-01-03T13:05:00Z'));
  expect(await tasks()).toHaveLength(2); // queued import still active
  await db.schedule.updateMany({ where: { workspaceId: ws, key: 'cmva_sync' }, data: { enabled: false } });
  await runSchedulerTick(d, new Date('2027-01-03T14:05:00Z'));
  expect(await tasks()).toHaveLength(2);
  await db.schedule.updateMany({ where: { workspaceId: ws, key: 'cmva_sync' }, data: { enabled: true } });
  await db.workspace.update({ where: { id: ws }, data: { emergencyStop: true } });
  await runSchedulerTick(d, new Date('2027-01-03T15:05:00Z'));
  expect(await tasks()).toHaveLength(2);
});

it('worker runs a missing-token sync without a model or network call', async () => {
  await configureCmvaSync(db, ws, profile);
  vi.stubEnv('CMVA_AI_SUMMARY_TOKEN', '');
  const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
  try {
    const task = await createTask(db, {
      workspaceId: ws,
      type: 'cmva_sync',
      title: 'CMVA demo auth failure',
      agentRole: 'analyst',
      isDemo: true,
    });
    await processTask(deps(db), task.id);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id, workspaceId: ws } })).status).toBe(
      'failed',
    );
    expect(await db.agentRun.count({ where: { workspaceId: ws, taskId: task.id } })).toBe(0);
    expect(request).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
    vi.unstubAllEnvs();
  }
});
