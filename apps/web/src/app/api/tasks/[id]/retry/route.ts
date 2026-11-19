import { createTask, getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

// Gerichte herpoging: maakt een nieuwe taak met dezelfde input. De mislukte taak blijft ongewijzigd bewaard.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth('task.retry', async (s) => {
    const db = getPrisma();
    const t = await db.task.findFirst({ where: { id, workspaceId: s.workspaceId } });
    if (!t) return json({ error: 'Taak niet gevonden' }, 404);
    if (t.status !== 'failed' && t.status !== 'cancelled') return json({ error: 'Alleen mislukte of geannuleerde taken opnieuw proberen' }, 409);
    if (t.parentTaskId) return json({ error: 'Deeltaken worden via de bovenliggende taak opnieuw gestart' }, 409);
    const n = await createTask(db, {
      workspaceId: s.workspaceId, type: t.type, title: `${t.title} (herpoging)`, agentRole: t.agentRole,
      input: t.input as Record<string, unknown>, createdById: s.userId, isDemo: t.isDemo,
    });
    await db.auditEvent.create({ data: { workspaceId: s.workspaceId, actorId: s.userId, action: 'task.retry', target: id, detail: { newTaskId: n.id } } });
    return json(n, 201);
  });
}
