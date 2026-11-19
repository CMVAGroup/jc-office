import { z } from 'zod';
import { createTask, getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

const Body = z.object({ type: z.literal('morning_brief'), fromLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), toLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function GET() {
  return withAuth('read', async (s) =>
    json(await getPrisma().task.findMany({ where: { workspaceId: s.workspaceId }, orderBy: { createdAt: 'desc' }, take: 200 })),
  );
}

export async function POST(req: Request) {
  return withAuth('task.create', async (s) => {
    const b = Body.parse(await req.json());
    const input = b.fromLocal && b.toLocal ? { fromLocal: b.fromLocal, toLocal: b.toLocal } : {};
    const t = await createTask(getPrisma(), {
      workspaceId: s.workspaceId, type: 'morning_brief', title: 'Maak ochtendbrief', agentRole: 'lead', input, createdById: s.userId, isDemo: s.isDemo,
    });
    return json(t, 201);
  });
}
