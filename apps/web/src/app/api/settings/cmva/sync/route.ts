import { cmvaConfig } from '@jc/connectors';
import { configureCmvaSync, createTask, getPrisma } from '@jc/db';
import { json, withAuth } from '@/lib/api';

export async function POST() {
  return withAuth('task.create', async (s) => {
    const { profile } = cmvaConfig();
    const db = getPrisma();
    await configureCmvaSync(db, s.workspaceId, profile);
    const task = await createTask(db, {
      workspaceId: s.workspaceId, type: 'cmva_sync', title: 'CMVA dagcijfers synchroniseren',
      agentRole: 'analyst', createdById: s.userId, isDemo: false,
    });
    return json({ taskId: task.id, message: 'CMVA-sync in wachtrij; uurschema staat klaar.' }, 201);
  });
}
