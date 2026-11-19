// Deterministische watchdog. Geen modelcall, geen succesclaim, geen retry of externe actie:
// hij classificeert alleen en levert alarmen die de baas/eigenaar kan oppakken.
import { timingFor } from './tasks';

export interface WatchdogTaskInput {
  id: string;
  type: string;
  status: string;
  agentRole: string;
  waitReason: string | null;
  rateLimitUntil: Date | null;
  queuedAt: Date;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  progressAt: Date | null;
  progressNote: string | null;
  deadlineAt: Date | null;
  failureReason: string | null;
  finishedAt: Date | null;
}

export type WatchState =
  | 'healthy'
  | 'waiting_dependency'
  | 'rate_limited'
  | 'awaiting_owner'
  | 'queued'
  | 'stalled'
  | 'heartbeat_lost'
  | 'deadline_missed'
  | 'queued_too_long'
  | 'failed'
  | 'done';

export const ALARM_STATES: ReadonlySet<WatchState> = new Set([
  'stalled',
  'heartbeat_lost',
  'deadline_missed',
  'queued_too_long',
  'failed',
]);

export const WATCH_STATE_LABELS: Record<WatchState, string> = {
  healthy: 'Loopt normaal',
  waiting_dependency: 'Wacht op deeltaak (normaal)',
  rate_limited: 'Provider-rate-limit (wacht, geen fout)',
  awaiting_owner: 'Wacht op eigenaar',
  queued: 'In wachtrij',
  stalled: 'Geen voortgang',
  heartbeat_lost: 'Heartbeat verlopen',
  deadline_missed: 'Deadline gemist',
  queued_too_long: 'Te lang in wachtrij',
  failed: 'Mislukt',
  done: 'Afgerond',
};

export interface WatchEvaluation {
  taskId: string;
  agentRole: string;
  state: WatchState;
  alarm: boolean;
  cause: string;
}

const sec = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 1000;

export function evaluateTask(t: WatchdogTaskInput, now: Date, recentFailureWindowSec = 3600): WatchEvaluation {
  const policy = timingFor(t.type);
  const base = { taskId: t.id, agentRole: t.agentRole };
  const mk = (state: WatchState, cause: string): WatchEvaluation => ({
    ...base,
    state,
    alarm: ALARM_STATES.has(state),
    cause,
  });

  if (t.status === 'succeeded' || t.status === 'cancelled') return mk('done', 'Afgerond');
  if (t.status === 'failed') {
    if (t.finishedAt && sec(now, t.finishedAt) > recentFailureWindowSec) return mk('done', 'Oude mislukking');
    return mk('failed', `Taak mislukt: ${t.failureReason ?? 'onbekende reden'}`);
  }
  if (t.deadlineAt && now > t.deadlineAt) {
    return mk('deadline_missed', `Deadline ${t.deadlineAt.toISOString()} verstreken; status ${t.status}`);
  }
  if (t.status === 'awaiting_review' || t.waitReason === 'owner_approval') {
    return mk('awaiting_owner', 'Wacht op beoordeling/goedkeuring door eigenaar');
  }
  if (t.status === 'blocked') {
    if (t.waitReason === 'rate_limit') {
      return mk('rate_limited', `Rate limit tot ${t.rateLimitUntil?.toISOString() ?? 'onbekend'}`);
    }
    return mk('waiting_dependency', 'Wacht op afhankelijke deeltaak');
  }
  if (t.status === 'queued') {
    if (sec(now, t.queuedAt) > policy.queueMaxAgeSec) {
      return mk('queued_too_long', `Al ${Math.round(sec(now, t.queuedAt))} s in wachtrij; draait de worker?`);
    }
    return mk('queued', 'In wachtrij');
  }
  if (t.status === 'running') {
    if (t.rateLimitUntil && now < t.rateLimitUntil) {
      return mk('rate_limited', `Provider-rate-limit tot ${t.rateLimitUntil.toISOString()}`);
    }
    const hb = t.heartbeatAt ?? t.startedAt;
    if (!hb || sec(now, hb) > policy.heartbeatTimeoutSec) {
      return mk(
        'heartbeat_lost',
        `Geen heartbeat sinds ${hb ? Math.round(sec(now, hb)) + ' s' : 'start'} — worker mogelijk gestopt`,
      );
    }
    const pg = t.progressAt ?? t.startedAt ?? hb;
    if (sec(now, pg) > policy.progressWindowSec) {
      return mk(
        'stalled',
        `Proces leeft (heartbeat), maar geen voortgang sinds ${Math.round(sec(now, pg))} s` +
          (t.progressNote ? ` — laatste update: ${t.progressNote}` : ''),
      );
    }
    return mk('healthy', t.progressNote ?? 'Bezig');
  }
  return mk('healthy', t.status);
}

export interface OpenAlert {
  id: string;
  taskId: string;
  state: string;
  lastSeenAt: Date;
}

export interface AlertPlan {
  open: WatchEvaluation[];
  touch: string[]; // bestaande alert-ids die nog gelden
  recover: string[]; // alert-ids waarvan taak hersteld/afgerond is
}

/** Dedup + cooldown: per taak hoogstens één open alarm per toestand; herstelde taken krijgen een herstelstatus. */
export function planAlerts(evals: WatchEvaluation[], openAlerts: OpenAlert[]): AlertPlan {
  const plan: AlertPlan = { open: [], touch: [], recover: [] };
  const byTask = new Map<string, OpenAlert[]>();
  for (const a of openAlerts) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), a]);
  const evalByTask = new Map(evals.map((e) => [e.taskId, e]));
  for (const e of evals) {
    if (!e.alarm) continue;
    const existing = (byTask.get(e.taskId) ?? []).find((a) => a.state === e.state);
    if (existing) plan.touch.push(existing.id);
    else plan.open.push(e);
  }
  for (const a of openAlerts) {
    const e = evalByTask.get(a.taskId);
    if (!e || !e.alarm || e.state !== a.state) plan.recover.push(a.id);
  }
  return plan;
}
