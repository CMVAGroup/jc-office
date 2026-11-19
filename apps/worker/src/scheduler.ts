// Duurzame applicatiescheduler. Uniek (schedule_id, planned_at) voorkomt dubbele starts, ook na herstart.
// Na uitval wordt hoogstens de laatste gemiste firing ingehaald (label 'verlaat'). Maakt geen externe agenda-afspraken.
import { createTask, emitEvent, Prisma } from '@jc/db';
import { computeDueFiring, MEETING_KIND_BY_KEY } from '@jc/domain';
import type { WorkerDeps } from './deps';
import { meetingTitle, startMeeting } from './meetings';
import { fireCmvaHour } from './cmva-schedule';

export async function runSchedulerTick(deps: WorkerDeps, now = new Date()) {
  const { db } = deps;
  const schedules = await db.schedule.findMany({ where: { enabled: true } });
  const fired: string[] = [];
  for (const s of schedules) {
    if (s.key === 'cmva_sync') {
      if (await fireCmvaHour(db, s.workspaceId, s.id, now)) fired.push(s.key);
      continue;
    }
    const last = await db.scheduleFiring.findFirst({ where: { scheduleId: s.id }, orderBy: { plannedAt: 'desc' } });
    const due = computeDueFiring(s, now, last?.plannedAt ?? null);
    if (!due) continue;
    const ws = await db.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } });
    let firing;
    try {
      firing = await db.scheduleFiring.create({
        data: { workspaceId: s.workspaceId, scheduleId: s.id, plannedAt: due.plannedAt, late: due.late, outcome: ws.emergencyStop ? 'skipped_emergency_stop' : 'started' },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // al door een andere run/worker gevuurd
      throw e;
    }
    if (ws.emergencyStop) continue;
    if (s.kind === 'meeting') {
      const r = await startMeeting(deps, {
        workspaceId: s.workspaceId,
        meetingKey: `${s.key}@${due.plannedAt.toISOString()}`,
        kind: MEETING_KIND_BY_KEY[s.key] ?? 'progress',
        title: meetingTitle(s.key, s.label, due.late),
        plannedAt: due.plannedAt,
        late: due.late,
        isDemo: ws.isDemo,
        scheduleKey: s.key,
      });
      await db.scheduleFiring.update({ where: { id: firing.id }, data: { refId: r.meeting.id } });
    } else if (s.key === 'morning_brief') {
      const t = await createTask(db, {
        workspaceId: s.workspaceId, type: 'morning_brief', title: `Ochtendbrief${due.late ? ' (verlaat)' : ''}`, agentRole: 'lead', isDemo: ws.isDemo,
      });
      await db.scheduleFiring.update({ where: { id: firing.id }, data: { refId: t.id } });
    }
    await emitEvent(db, { workspaceId: s.workspaceId, kind: 'schedule.fired', payload: { key: s.key, plannedAt: due.plannedAt.toISOString(), late: due.late } });
    fired.push(s.key);
  }
  return fired;
}
