// Taakstatussen en gevalideerde transities.

export const TASK_STATUSES = [
  'queued',
  'running',
  'blocked',
  'awaiting_review',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(['succeeded', 'failed', 'cancelled']);

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ['running', 'cancelled', 'blocked'],
  // running → queued: lease verlopen / gerichte herpoging (begrensd door maxAttempts)
  running: ['succeeded', 'failed', 'blocked', 'awaiting_review', 'cancelled', 'queued'],
  blocked: ['queued', 'cancelled', 'failed'],
  awaiting_review: ['succeeded', 'failed', 'queued', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: 'In wachtrij',
  running: 'Bezig',
  blocked: 'Geblokkeerd / wacht',
  awaiting_review: 'Review',
  succeeded: 'Gereed',
  failed: 'Mislukt',
  cancelled: 'Geannuleerd',
};

export class InvalidTransitionError extends Error {
  constructor(
    public from: string,
    public to: string,
  ) {
    super(`Ongeldige taaktransitie: ${from} → ${to}`);
  }
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!(TASK_STATUSES as readonly string[]).includes(from) || !(TASK_STATUSES as readonly string[]).includes(to))
    throw new InvalidTransitionError(from, to);
  if (!canTransition(from as TaskStatus, to as TaskStatus)) throw new InvalidTransitionError(from, to);
}

/** Toegestane bronstatussen voor een doelstatus — handig voor voorwaardelijke UPDATE … WHERE status IN (…). */
export function allowedFrom(to: TaskStatus): TaskStatus[] {
  return TASK_STATUSES.filter((s) => TRANSITIONS[s].includes(to));
}

export type TaskType = 'cmva_sync' | 'morning_brief' | 'commerce_analysis' | 'meeting_demo' | 'demo_stall' | 'demo_rate_limit';

/** Verwacht voortgangsvenster per taaktype (watchdog). Lange imports mogen ruimer. */
export interface TaskTimingPolicy {
  /** Max. seconden zonder betekenisvolle voortgang terwijl de taak loopt */
  progressWindowSec: number;
  /** Max. seconden sinds laatste heartbeat voordat het proces als verdwenen geldt */
  heartbeatTimeoutSec: number;
  /** Max. seconden in wachtrij */
  queueMaxAgeSec: number;
  /** Lease voor claim door worker */
  leaseSec: number;
}

export const TASK_TIMING: Record<TaskType, TaskTimingPolicy> = {
  cmva_sync: { progressWindowSec: 120, heartbeatTimeoutSec: 45, queueMaxAgeSec: 300, leaseSec: 60 },
  morning_brief: { progressWindowSec: 120, heartbeatTimeoutSec: 45, queueMaxAgeSec: 300, leaseSec: 60 },
  commerce_analysis: { progressWindowSec: 90, heartbeatTimeoutSec: 45, queueMaxAgeSec: 300, leaseSec: 60 },
  meeting_demo: { progressWindowSec: 60, heartbeatTimeoutSec: 45, queueMaxAgeSec: 300, leaseSec: 60 },
  demo_stall: { progressWindowSec: 30, heartbeatTimeoutSec: 45, queueMaxAgeSec: 300, leaseSec: 60 },
  demo_rate_limit: { progressWindowSec: 30, heartbeatTimeoutSec: 45, queueMaxAgeSec: 300, leaseSec: 60 },
};

export function timingFor(type: string): TaskTimingPolicy {
  return TASK_TIMING[type as TaskType] ?? TASK_TIMING.commerce_analysis;
}
