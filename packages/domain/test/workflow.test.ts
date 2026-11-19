import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  computeDueFiring,
  evaluateTask,
  MorningBriefSchema,
  nextPlanned,
  planAlerts,
  validateEvidence,
  emptyKnownEvidence,
  zonedTimeToUtc,
  type ScheduleSpec,
  type WatchdogTaskInput,
} from '../src';

const tz = 'Europe/Amsterdam';

describe('taaktransities', () => {
  it('staat geldige overgangen toe en weigert ongeldige', () => {
    expect(canTransition('queued', 'running')).toBe(true);
    expect(canTransition('running', 'succeeded')).toBe(true);
    expect(canTransition('blocked', 'queued')).toBe(true);
    expect(canTransition('succeeded', 'running')).toBe(false);
    expect(canTransition('queued', 'succeeded')).toBe(false);
    expect(() => assertTransition('cancelled', 'queued')).toThrow(/Ongeldige/);
    expect(() => assertTransition('bogus', 'queued')).toThrow();
  });
});

describe('planning', () => {
  const spec: ScheduleSpec = { timeOfDay: '09:00', weekdays: [1, 2, 3, 4, 5], timezone: tz, graceMinutes: 10, maxCatchUpMinutes: 180, enabled: true };
  it('vuurt op tijd en niet nogmaals voor dezelfde geplande tijd', () => {
    const now = zonedTimeToUtc(2026, 11, 18, 9, 2, tz);
    const due = computeDueFiring(spec, now, null)!;
    expect(due.late).toBe(false);
    expect(due.plannedAt.toISOString()).toBe('2026-11-18T08:00:00.000Z');
    expect(computeDueFiring(spec, now, due.plannedAt)).toBeNull();
  });
  it('labelt een ingehaalde run als verlaat en speelt geen oude stapel af', () => {
    const due = computeDueFiring(spec, zonedTimeToUtc(2026, 11, 18, 10, 30, tz), null)!;
    expect(due.late).toBe(true);
    expect(computeDueFiring(spec, zonedTimeToUtc(2026, 11, 18, 13, 30, tz), null)).toBeNull(); // > 180 min
  });
  it('slaat weekenden over en respecteert zomertijd', () => {
    expect(computeDueFiring(spec, zonedTimeToUtc(2026, 11, 21, 9, 5, tz), null)).toBeNull(); // zaterdag
    expect(nextPlanned(spec, zonedTimeToUtc(2026, 11, 20, 17, 0, tz))!.toISOString()).toBe('2026-11-23T08:00:00.000Z');
    expect(computeDueFiring(spec, zonedTimeToUtc(2026, 7, 15, 9, 1, tz), null)!.plannedAt.toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });
  it('uitgeschakeld schema vuurt nooit', () => {
    expect(computeDueFiring({ ...spec, enabled: false }, zonedTimeToUtc(2026, 11, 18, 9, 1, tz), null)).toBeNull();
  });
});

describe('watchdog', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  const base: WatchdogTaskInput = {
    id: 't', type: 'commerce_analysis', status: 'running', agentRole: 'analyst', waitReason: null, rateLimitUntil: null,
    queuedAt: new Date(now.getTime() - 60e3), startedAt: new Date(now.getTime() - 50e3), heartbeatAt: new Date(now.getTime() - 5e3),
    progressAt: new Date(now.getTime() - 10e3), progressNote: 'stap 2', deadlineAt: null, failureReason: null, finishedAt: null,
  };
  it('normaal lopend werk is gezond', () => expect(evaluateTask(base, now).alarm).toBe(false));
  it('heartbeat zonder voortgang = stagnatie (alarm)', () => {
    const e = evaluateTask({ ...base, progressAt: new Date(now.getTime() - 600e3) }, now);
    expect(e.state).toBe('stalled');
    expect(e.alarm).toBe(true);
  });
  it('verlopen heartbeat = heartbeat_lost', () => expect(evaluateTask({ ...base, heartbeatAt: new Date(now.getTime() - 600e3) }, now).state).toBe('heartbeat_lost'));
  it('rate limit, wachten op eigenaar en wachten op deeltaak geven geen alarm', () => {
    expect(evaluateTask({ ...base, rateLimitUntil: new Date(now.getTime() + 60e3), progressAt: new Date(0) }, now)).toMatchObject({ state: 'rate_limited', alarm: false });
    expect(evaluateTask({ ...base, status: 'awaiting_review' }, now)).toMatchObject({ state: 'awaiting_owner', alarm: false });
    expect(evaluateTask({ ...base, status: 'blocked', waitReason: 'dependency' }, now)).toMatchObject({ state: 'waiting_dependency', alarm: false });
  });
  it('te lang in wachtrij en gemiste deadline alarmeren', () => {
    expect(evaluateTask({ ...base, status: 'queued', queuedAt: new Date(now.getTime() - 3600e3) }, now).state).toBe('queued_too_long');
    expect(evaluateTask({ ...base, deadlineAt: new Date(now.getTime() - 1) }, now).state).toBe('deadline_missed');
  });
  it('dedupliceert alarmen en markeert herstel', () => {
    const stalled = evaluateTask({ ...base, progressAt: new Date(0) }, now);
    const open = [{ id: 'a1', taskId: 't', state: 'stalled', lastSeenAt: now }];
    expect(planAlerts([stalled], open)).toEqual({ open: [], touch: ['a1'], recover: [] });
    expect(planAlerts([evaluateTask(base, now)], open)).toEqual({ open: [], touch: [], recover: ['a1'] });
    expect(planAlerts([stalled], []).open).toHaveLength(1);
  });
});

describe('uitvoerschema en bewijs', () => {
  const brief = {
    summary: 's', facts: [{ statement: 'x', value: 10, evidence: [{ kind: 'metric_snapshot', id: 'm1' }] }], hypotheses: [], recommendations: [],
    sourceRecords: [], period: { from: 'a', to: 'b', timezone: tz }, freshness: [], assumptions: [], limitations: [], missingData: [], artifacts: [],
    proposedAction: null, isDemo: true, priorities: [{ title: 'p', rationale: 'r', ownerRole: 'lead', evidence: [{ kind: 'metric_snapshot', id: 'm1' }] }],
  };
  it('weigert meer dan drie prioriteiten en prioriteiten zonder bewijs', () => {
    expect(MorningBriefSchema.safeParse(brief).success).toBe(true);
    expect(MorningBriefSchema.safeParse({ ...brief, priorities: Array(4).fill(brief.priorities[0]) }).success).toBe(false);
    expect(MorningBriefSchema.safeParse({ ...brief, priorities: [{ ...brief.priorities[0], evidence: [] }] }).success).toBe(false);
  });
  it('detecteert verzonnen cijfers en onbekende bronverwijzingen', () => {
    const k = emptyKnownEvidence();
    k.metricSnapshots.set('m1', { metricKey: 'x', value: 10 });
    const parsed = MorningBriefSchema.parse(brief);
    expect(validateEvidence(parsed, k)).toEqual([]);
    expect(validateEvidence({ ...parsed, facts: [{ ...parsed.facts[0]!, value: 11 }] }, k)[0]).toMatch(/wijkt af/);
    expect(validateEvidence({ ...parsed, facts: [{ ...parsed.facts[0]!, evidence: [{ kind: 'metric_snapshot', id: 'nope' }] }] }, k).length).toBeGreaterThan(0);
  });
});
