import { z } from 'zod';
import { getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

const Body = z.object({
  key: z.string(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enabled: z.boolean(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
});

export async function POST(req: Request) {
  return withAuth('settings.write', async (s) => {
    const b = Body.parse(await req.json());
    const db = getPrisma();
    const r = await db.schedule.updateMany({
      where: { workspaceId: s.workspaceId, key: b.key },
      data: { timeOfDay: b.timeOfDay, enabled: b.enabled, ...(b.weekdays ? { weekdays: b.weekdays } : {}) },
    });
    if (r.count !== 1) return json({ error: 'Schema niet gevonden' }, 404);
    await db.auditEvent.create({ data: { workspaceId: s.workspaceId, actorId: s.userId, action: 'schedule.update', target: b.key, detail: b } });
    return json({ ok: true });
  });
}
