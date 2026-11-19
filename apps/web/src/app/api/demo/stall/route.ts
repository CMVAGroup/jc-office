import { z } from 'zod';
import { createTask, getPrisma } from '@jc/db';
import { AGENT_ROLES } from '@jc/domain';
import { json, withAuth } from '@/lib/api';

const Body = z.object({ role: z.enum(AGENT_ROLES).default('growth'), durationSec: z.number().int().min(30).max(1800).default(300) });

// DEMO: start een echte backendtaak die wel heartbeats stuurt maar geen voortgang maakt.
export async function POST(req: Request) {
  return withAuth('demo.simulate', async (s) => {
    const b = Body.parse(await req.json().catch(() => ({})));
    const t = await createTask(getPrisma(), {
      workspaceId: s.workspaceId, type: 'demo_stall', title: 'DEMO: gesimuleerde vastgelopen Meta-import', agentRole: b.role,
      input: { durationSec: b.durationSec }, createdById: s.userId, isDemo: true, maxAttempts: 1,
    });
    return json(t, 201);
  });
}
