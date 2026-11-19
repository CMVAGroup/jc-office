import { getPrisma, transitionTask } from '@jc/db';
import { TERMINAL_STATUSES, type TaskStatus } from '@jc/domain';
import { json, withAuth } from '@/lib/api';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth('task.cancel', async (s) => {
    const db = getPrisma();
    const t = await db.task.findFirst({ where: { id, workspaceId: s.workspaceId } });
    if (!t) return json({ error: 'Taak niet gevonden' }, 404);
    if (TERMINAL_STATUSES.has(t.status as TaskStatus)) return json({ error: `Taak is al ${t.status}` }, 409);
    const r = await transitionTask(db, id, 'cancelled', { payload: { by: s.userId } });
    await db.auditEvent.create({ data: { workspaceId: s.workspaceId, actorId: s.userId, action: 'task.cancel', target: id } });
    return json(r);
  });
}
