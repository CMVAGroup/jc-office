// Gezaghebbende kantoorstatus uit de backend. De browser animeert op basis hiervan; werkstatus ≠ positie.
import { ROLE_CONFIGS } from '@jc/agents';
import { getPrisma } from '@jc/db';
import { AGENT_ROLES, isWorkingHours, WATCH_STATE_LABELS, type AgentRole, type WatchState } from '@jc/domain';

export interface OfficeState {
  now: string;
  cursor: number;
  workHours: boolean;
  modelMode: { provider: string; isMock: boolean };
  workerOnline: boolean;
  workerLastBeat: string | null;
  emergencyStop: boolean;
  agents: {
    role: AgentRole;
    label: string;
    implemented: boolean;
    goal: string;
    allowedTools: string[];
    limits: string[];
    activeTask: { id: string; title: string; status: string; progressNote: string | null; heartbeatAt: string | null } | null;
    recentTasks: { id: string; title: string; status: string; updatedAt: string }[];
    working: boolean;
    blocked: boolean;
  }[];
  alerts: { id: string; taskId: string; role: AgentRole; state: string; stateLabel: string; cause: string; openedAt: string }[];
  meeting: null | {
    id: string;
    title: string;
    kind: string;
    late: boolean;
    isDemo: boolean;
    startedAt: string;
    endsAt: string | null;
    status: string;
    updates: { role: AgentRole; text: string; order: number; staleInput: boolean; evidence: { kind: string; id: string }[] }[];
    synthesis: unknown;
    synthesisError: string | null;
  };
  pendingApprovals: number;
  connections: { provider: string; status: string }[];
}

export async function getOfficeState(workspaceId: string): Promise<OfficeState> {
  const db = getPrisma();
  const now = new Date();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const tasks = await db.task.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 100 });
  const alerts = await db.watchdogAlert.findMany({ where: { workspaceId, status: 'open' }, orderBy: { openedAt: 'asc' } });
  const meeting = await db.meeting.findFirst({
    where: { workspaceId, status: { in: ['gathering', 'in_progress'] } },
    orderBy: { startedAt: 'desc' },
    include: { updates: { orderBy: { order: 'asc' } } },
  });
  const last = await db.officeEvent.findFirst({ where: { workspaceId }, orderBy: { id: 'desc' }, select: { id: true } });
  const hb = await db.workerHeartbeat.findFirst({ orderBy: { lastBeatAt: 'desc' } });
  const pending = await db.actionProposal.count({ where: { workspaceId, status: 'pending_approval' } });
  const conns = await db.connection.findMany({ where: { workspaceId } });
  const provider = process.env.MODEL_PROVIDER === 'ollama' ? 'ollama' : process.env.MODEL_PROVIDER === 'anthropic' && process.env.ALLOW_REAL_MODEL_RUNS === 'true' ? 'anthropic' : 'mock';
  return {
    now: now.toISOString(),
    cursor: last?.id ?? 0,
    workHours: isWorkingHours(now, ws.reportingTimezone),
    modelMode: { provider, isMock: provider === 'mock' },
    workerOnline: !!hb && now.getTime() - hb.lastBeatAt.getTime() < 30_000,
    workerLastBeat: hb?.lastBeatAt.toISOString() ?? null,
    emergencyStop: ws.emergencyStop,
    agents: AGENT_ROLES.map((role) => {
      const cfg = ROLE_CONFIGS[role];
      const mine = tasks.filter((t) => t.agentRole === role);
      const active = mine.find((t) => t.status === 'running') ?? mine.find((t) => ['queued', 'blocked', 'awaiting_review'].includes(t.status));
      return {
        role,
        label: cfg.label,
        implemented: cfg.implemented,
        goal: cfg.goal,
        allowedTools: cfg.allowedTools,
        limits: cfg.limits,
        activeTask: active
          ? { id: active.id, title: active.title, status: active.status, progressNote: active.progressNote, heartbeatAt: active.heartbeatAt?.toISOString() ?? null }
          : null,
        recentTasks: mine.slice(0, 5).map((t) => ({ id: t.id, title: t.title, status: t.status, updatedAt: t.updatedAt.toISOString() })),
        // 'bezig' alleen met een actieve run en verse heartbeat — geen gesimuleerde activiteit.
        working: mine.some((t) => t.status === 'running' && !!t.heartbeatAt && now.getTime() - t.heartbeatAt.getTime() < 60_000),
        blocked: alerts.some((a) => a.agentRole === role),
      };
    }),
    alerts: alerts.map((a) => ({
      id: a.id, taskId: a.taskId, role: a.agentRole as AgentRole, state: a.state,
      stateLabel: WATCH_STATE_LABELS[a.state as WatchState] ?? a.state, cause: a.cause, openedAt: a.openedAt.toISOString(),
    })),
    meeting: meeting
      ? {
          id: meeting.id, title: meeting.title, kind: meeting.kind, late: meeting.late, isDemo: meeting.isDemo,
          startedAt: meeting.startedAt.toISOString(), endsAt: (meeting.snapshot as { endsAt?: string }).endsAt ?? null, status: meeting.status,
          updates: meeting.updates.map((u) => ({ role: u.agentRole as AgentRole, text: u.text, order: u.order, staleInput: u.staleInput, evidence: u.evidence as { kind: string; id: string }[] })),
          synthesis: meeting.synthesis, synthesisError: meeting.synthesisError,
        }
      : null,
    pendingApprovals: pending,
    connections: conns.map((c) => ({ provider: c.provider, status: c.status })),
  };
}
