import { createTask, getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

// DEMO: provider-rate-limit — normaal wachten, de hond hoort hier GEEN alarm te geven.
export async function POST() {
  return withAuth('demo.simulate', async (s) => {
    const t = await createTask(getPrisma(), {
      workspaceId: s.workspaceId, type: 'demo_rate_limit', title: 'DEMO: Klaviyo-rapport wacht op rate limit', agentRole: 'retention',
      input: { waitSec: 90 }, createdById: s.userId, isDemo: true, maxAttempts: 1,
    });
    return json(t, 201);
  });
}
