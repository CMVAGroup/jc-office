import { emitEvent, type Db } from '@jc/db';

/** Claim the hour and enqueue atomically. A crash cannot leave a claimed hour without its task. */
export async function fireCmvaHour(db: Db, workspaceId: string, scheduleId: string, now: Date) {
  const plannedAt = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  return db.$transaction(async (tx) => {
    // Serializes concurrent scheduler processes for this workspace's schedule.
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${scheduleId} AND workspace_id = ${workspaceId} FOR UPDATE`;
    const schedule = await tx.schedule.findFirst({
      where: { id: scheduleId, workspaceId, enabled: true, key: 'cmva_sync' },
    });
    if (!schedule) return false;
    const last = await tx.scheduleFiring.findFirst({
      where: { scheduleId, workspaceId },
      orderBy: { plannedAt: 'desc' },
    });
    if (last && last.plannedAt >= plannedAt) return false;
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const late = now.getTime() - plannedAt.getTime() > 600_000;
    const firing = await tx.scheduleFiring.create({
      data: {
        workspaceId,
        scheduleId,
        plannedAt,
        late,
        outcome: workspace.emergencyStop ? 'skipped_emergency_stop' : 'started',
      },
    });
    if (workspace.emergencyStop) return false;
    const active = await tx.task.findFirst({
      where: { workspaceId, type: 'cmva_sync', status: { in: ['queued', 'running', 'blocked'] } },
    });
    if (!active) {
      const task = await tx.task.create({
        data: {
          workspaceId,
          type: 'cmva_sync',
          title: 'CMVA uursync',
          agentRole: 'analyst',
          status: 'queued',
          isDemo: false,
        },
      });
      await emitEvent(tx, {
        workspaceId,
        kind: 'task.created',
        taskId: task.id,
        agentRole: task.agentRole,
        payload: { type: task.type, title: task.title, status: task.status },
      });
      await tx.scheduleFiring.update({ where: { id: firing.id, workspaceId }, data: { refId: task.id } });
    }
    await emitEvent(tx, {
      workspaceId,
      kind: 'schedule.fired',
      payload: { key: 'cmva_sync', plannedAt: plannedAt.toISOString(), late },
    });
    return true;
  });
}
