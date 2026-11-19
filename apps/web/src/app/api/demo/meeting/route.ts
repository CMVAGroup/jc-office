import { createTask, getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

// Demoknop: vraag de worker om direct een vergadering te houden. Inhoud komt uit echte opgeslagen taken; label demo.
export async function POST() {
  return withAuth('meeting.start_demo', async (s) => {
    const db = getPrisma();
    const busy = await db.meeting.findFirst({ where: { workspaceId: s.workspaceId, status: { in: ['gathering', 'in_progress'] } } });
    if (busy) return json({ error: 'Er loopt al een vergadering' }, 409);
    const t = await createTask(db, { workspaceId: s.workspaceId, type: 'meeting_demo', title: 'Demo-vergadering starten', agentRole: 'lead', createdById: s.userId, isDemo: true });
    return json(t, 201);
  });
}
