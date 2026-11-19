// De kantoorhond als deterministische watchdog: beoordeelt, alarmeert, herstelt alarmen. Voert zelf niets uit.
import { emitEvent } from '@jc/db';
import { evaluateTask, planAlerts } from '@jc/domain';
import type { WorkerDeps } from './deps';

export async function runWatchdogTick(deps: WorkerDeps, now = new Date()) {
  const { db } = deps;
  const tasks = await db.task.findMany({
    where: {
      OR: [
        { status: { in: ['queued', 'running', 'blocked', 'awaiting_review'] } },
        { status: 'failed', finishedAt: { gte: new Date(now.getTime() - 3600e3) } },
      ],
    },
  });
  const evals = tasks.map((t) => ({ ws: t.workspaceId, e: evaluateTask(t, now) }));
  const openAlerts = await db.watchdogAlert.findMany({ where: { status: 'open' } });
  // Taken die niet meer in de lijst staan (afgerond) gelden als hersteld.
  const plan = planAlerts(evals.map((x) => x.e), openAlerts);
  for (const e of plan.open) {
    const ws = evals.find((x) => x.e.taskId === e.taskId)!.ws;
    const a = await db.watchdogAlert.create({ data: { workspaceId: ws, taskId: e.taskId, agentRole: e.agentRole, state: e.state, cause: e.cause, status: 'open' } });
    await emitEvent(db, { workspaceId: ws, kind: 'watchdog.alert', taskId: e.taskId, agentRole: e.agentRole, payload: { alertId: a.id, state: e.state, cause: e.cause } });
    deps.log(`watchdog: ${e.state}`, { taskId: e.taskId, cause: e.cause });
  }
  if (plan.touch.length) await db.watchdogAlert.updateMany({ where: { id: { in: plan.touch } }, data: { lastSeenAt: now } });
  for (const id of plan.recover) {
    const a = await db.watchdogAlert.update({ where: { id }, data: { status: 'recovered', resolvedAt: now } });
    await emitEvent(db, { workspaceId: a.workspaceId, kind: 'watchdog.recovered', taskId: a.taskId, agentRole: a.agentRole, payload: { alertId: id } });
  }
  return { evaluations: evals.map((x) => x.e), opened: plan.open.length, recovered: plan.recover.length };
}
