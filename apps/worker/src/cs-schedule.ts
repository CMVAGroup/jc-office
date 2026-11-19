import { emitEvent, type Db } from '@jc/db';
import { isWorkingHours } from '@jc/domain';

const CS_INTERVAL_MS = 15 * 60_000; // 15 minutes
const CS_TZ = 'Europe/Amsterdam';
const CS_START_HOUR = 8;
const CS_END_HOUR = 20;

/** Fire at most once per 15-minute slot during business hours (08:00–20:00 Amsterdam). */
export async function fireCsSlot(db: Db, workspaceId: string, scheduleId: string, now: Date) {
  if (!isWorkingHours(now, CS_TZ, CS_START_HOUR, CS_END_HOUR)) return false;
  const slotStart = new Date(Math.floor(now.getTime() / CS_INTERVAL_MS) * CS_INTERVAL_MS);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM schedules WHERE id = ${scheduleId} AND workspace_id = ${workspaceId} FOR UPDATE`;
    const schedule = await tx.schedule.findFirst({ where: { id: scheduleId, workspaceId, enabled: true, key: 'cs_medewerker' } });
    if (!schedule) return false;
    const last = await tx.scheduleFiring.findFirst({ where: { scheduleId, workspaceId }, orderBy: { plannedAt: 'desc' } });
    if (last && last.plannedAt >= slotStart) return false;
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const late = now.getTime() - slotStart.getTime() > 5 * 60_000;
    const firing = await tx.scheduleFiring.create({
      data: { workspaceId, scheduleId, plannedAt: slotStart, late, outcome: workspace.emergencyStop ? 'skipped_emergency_stop' : 'started' },
    });
    if (workspace.emergencyStop) return false;
    const active = await tx.task.findFirst({
      where: { workspaceId, type: 'cs_medewerker', status: { in: ['queued', 'running', 'blocked'] } },
    });
    if (!active) {
      const task = await tx.task.create({
        data: { workspaceId, type: 'cs_medewerker', title: 'CS Medewerker — inbox check', agentRole: 'merch', status: 'queued', isDemo: false },
      });
      await emitEvent(tx, { workspaceId, kind: 'task.created', taskId: task.id, agentRole: task.agentRole, payload: { type: task.type, title: task.title, status: task.status } });
      await tx.scheduleFiring.update({ where: { id: firing.id, workspaceId }, data: { refId: task.id } });
    }
    await emitEvent(tx, { workspaceId, kind: 'schedule.fired', payload: { key: 'cs_medewerker', plannedAt: slotStart.toISOString(), late } });
    return true;
  });
}
