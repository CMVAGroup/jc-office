// Duurzame taken: voorwaardelijke claims met lease, gevalideerde transities en een eventfeed.
// Een herstart verliest geen taken (alles staat in PostgreSQL) en voert niet willekeurig dubbel uit:
// een taak kan alleen worden geclaimd als hij 'queued' is of als de lease van een vorige worker verlopen is.
import { allowedFrom, assertTransition, timingFor, type TaskStatus } from '@jc/domain';
import type { Db, Tx } from './client';
import { Prisma } from './client';

type Client = Db | Tx;

export interface EmitInput {
  workspaceId: string;
  kind: string;
  taskId?: string | null;
  meetingId?: string | null;
  agentRole?: string | null;
  payload?: Record<string, unknown>;
}

export async function emitEvent(db: Client, e: EmitInput) {
  return db.officeEvent.create({
    data: {
      workspaceId: e.workspaceId,
      kind: e.kind,
      taskId: e.taskId ?? null,
      meetingId: e.meetingId ?? null,
      agentRole: e.agentRole ?? null,
      payload: (e.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export interface CreateTaskInput {
  workspaceId: string;
  type: string;
  title: string;
  agentRole: string;
  input?: Record<string, unknown>;
  createdById?: string | null;
  parentTaskId?: string | null;
  isDemo?: boolean;
  deadlineAt?: Date | null;
  maxAttempts?: number;
}

export async function createTask(db: Db, t: CreateTaskInput) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId: t.workspaceId,
        type: t.type,
        title: t.title,
        agentRole: t.agentRole,
        status: 'queued',
        input: (t.input ?? {}) as Prisma.InputJsonValue,
        createdById: t.createdById ?? null,
        parentTaskId: t.parentTaskId ?? null,
        isDemo: t.isDemo ?? false,
        deadlineAt: t.deadlineAt ?? null,
        maxAttempts: t.maxAttempts ?? 2,
      },
    });
    if (t.parentTaskId) {
      await tx.taskDependency.create({
        data: { workspaceId: t.workspaceId, taskId: t.parentTaskId, dependsOnId: task.id },
      });
    }
    await emitEvent(tx, {
      workspaceId: t.workspaceId,
      kind: 'task.created',
      taskId: task.id,
      agentRole: task.agentRole,
      payload: { type: task.type, title: task.title, status: 'queued' },
    });
    return task;
  });
}

/** Claim met lease. Retourneert null als de taak niet (meer) claimbaar is — dubbele jobs zijn daardoor onschadelijk. */
export async function claimTask(db: Db, taskId: string, workerId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; type: string; status: string; attempts: number; max_attempts: number; workspace_id: string; agent_role: string; lease_until: Date | null }[]>`
      SELECT id, type, status, attempts, max_attempts, workspace_id, agent_role, lease_until
      FROM tasks WHERE id = ${taskId} FOR UPDATE`;
    const row = rows[0];
    if (!row) return null;
    const leaseExpired = row.status === 'running' && row.lease_until !== null && row.lease_until < now;
    if (row.status !== 'queued' && !leaseExpired) return null;
    if (row.attempts >= row.max_attempts) {
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          finishedAt: now,
          failureReason: 'Maximaal aantal pogingen bereikt (worker-onderbrekingen); geen automatische herhaling.',
          leaseOwner: null,
          leaseUntil: null,
        },
      });
      await emitEvent(tx, { workspaceId: row.workspace_id, kind: 'task.failed', taskId, agentRole: row.agent_role, payload: { reason: 'max_attempts' } });
      return null;
    }
    const lease = timingFor(row.type).leaseSec;
    // Een poging telt bij de eerste start en bij overname na een verlopen lease (crash).
    // Hervatten na een afgeronde deeltaak (blocked → queued) is geen nieuwe poging.
    const countsAsAttempt = row.attempts === 0 || leaseExpired;
    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        status: 'running',
        attempts: countsAsAttempt ? { increment: 1 } : undefined,
        leaseOwner: workerId,
        leaseUntil: new Date(now.getTime() + lease * 1000),
        heartbeatAt: now,
        progressAt: now,
        progressNote: leaseExpired ? 'Overgenomen na verlopen lease' : 'Gestart',
        startedAt: now,
        waitReason: null,
      },
    });
    await emitEvent(tx, {
      workspaceId: row.workspace_id,
      kind: leaseExpired ? 'task.reclaimed' : 'task.started',
      taskId,
      agentRole: row.agent_role,
      payload: { attempt: task.attempts, workerId },
    });
    return task;
  });
}

/** Heartbeat bewijst alleen dat het proces leeft; het is geen voortgang. */
export async function heartbeatTask(db: Db, taskId: string, workerId: string, now = new Date()) {
  const t = await db.task.findUnique({ where: { id: taskId }, select: { type: true } });
  if (!t) return false;
  const lease = timingFor(t.type).leaseSec;
  const r = await db.task.updateMany({
    where: { id: taskId, status: 'running', leaseOwner: workerId },
    data: { heartbeatAt: now, leaseUntil: new Date(now.getTime() + lease * 1000) },
  });
  return r.count === 1;
}

/** Betekenisvolle voortgang (stap afgerond). */
export async function reportProgress(db: Db, taskId: string, workerId: string, note: string, now = new Date()) {
  const r = await db.task.updateMany({
    where: { id: taskId, status: 'running', leaseOwner: workerId },
    data: { progressAt: now, progressNote: note, heartbeatAt: now },
  });
  if (r.count === 1) {
    const t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    await emitEvent(db, { workspaceId: t.workspaceId, kind: 'task.progress', taskId, agentRole: t.agentRole, payload: { note } });
  }
  return r.count === 1;
}

export class TaskConflictError extends Error {}

/**
 * Gevalideerde transitie. Faalt (TaskConflictError) als de taak intussen een andere status kreeg,
 * of — bij opgegeven workerId — de lease niet meer bezit.
 */
export async function transitionTask(
  db: Client,
  taskId: string,
  to: TaskStatus,
  opts: { workerId?: string; patch?: Prisma.TaskUpdateManyMutationInput; payload?: Record<string, unknown> } = {},
) {
  const current = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  assertTransition(current.status, to);
  const terminal = to === 'succeeded' || to === 'failed' || to === 'cancelled';
  const r = await db.task.updateMany({
    where: {
      id: taskId,
      status: { in: allowedFrom(to) },
      ...(opts.workerId ? { leaseOwner: opts.workerId } : {}),
    },
    data: {
      status: to,
      ...(terminal ? { finishedAt: new Date(), leaseOwner: null, leaseUntil: null } : {}),
      ...(to === 'queued' ? { queuedAt: new Date(), dispatchedAt: null, leaseOwner: null, leaseUntil: null } : {}),
      ...(to === 'blocked' ? { leaseOwner: null, leaseUntil: null } : {}),
      ...opts.patch,
    },
  });
  if (r.count !== 1) throw new TaskConflictError(`Taak ${taskId} kon niet naar ${to} (status of lease gewijzigd)`);
  await emitEvent(db, {
    workspaceId: current.workspaceId,
    kind: `task.${to}`,
    taskId,
    agentRole: current.agentRole,
    payload: { from: current.status, to, ...opts.payload },
  });
  return db.task.findUniqueOrThrow({ where: { id: taskId } });
}

/** Zet ouder-taken terug in de wachtrij zodra alle afhankelijkheden klaar zijn. */
export async function releaseParentIfReady(db: Db, childTaskId: string) {
  const deps = await db.taskDependency.findMany({ where: { dependsOnId: childTaskId } });
  for (const d of deps) {
    const all = await db.taskDependency.findMany({ where: { taskId: d.taskId } });
    const children = await db.task.findMany({ where: { id: { in: all.map((a) => a.dependsOnId) } } });
    const parent = await db.task.findUnique({ where: { id: d.taskId } });
    if (!parent || parent.status !== 'blocked' || parent.waitReason !== 'dependency') continue;
    if (children.some((c) => c.status === 'failed' || c.status === 'cancelled')) {
      const failed = children.find((c) => c.status === 'failed' || c.status === 'cancelled');
      await transitionTask(db, parent.id, 'failed', {
        patch: { failureReason: `Deeltaak ${failed?.title} eindigde als ${failed?.status}: ${failed?.failureReason ?? ''}`, waitReason: null },
      });
    } else if (children.every((c) => c.status === 'succeeded')) {
      await transitionTask(db, parent.id, 'queued', { patch: { waitReason: null } });
    }
  }
}
