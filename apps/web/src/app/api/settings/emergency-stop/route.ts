import { z } from 'zod';
import { emitEvent, getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

// Owner-noodstop: blokkeert nieuwe modeltaken en (toekomstige) externe writes. Audit blijft werken.
export async function POST(req: Request) {
  return withAuth('emergency_stop', async (s) => {
    const { active } = z.object({ active: z.boolean() }).parse(await req.json());
    const db = getPrisma();
    await db.workspace.update({ where: { id: s.workspaceId }, data: { emergencyStop: active } });
    await db.auditEvent.create({ data: { workspaceId: s.workspaceId, actorId: s.userId, action: active ? 'emergency_stop.on' : 'emergency_stop.off' } });
    await emitEvent(db, { workspaceId: s.workspaceId, kind: 'settings.emergency_stop', payload: { active } });
    return json({ ok: true, active });
  });
}
