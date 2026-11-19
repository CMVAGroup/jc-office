// Backendimplementatie van de begrensde agenttools. Altijd gescoped op workspace_id uit de taakcontext.
import type { ToolImpl } from '@jc/agents';
import type { Db } from '@jc/db';
import { Prisma } from '@jc/db';
import { proposalHash } from '@jc/policy';

export function toolImpl(db: Db): ToolImpl {
  return {
    'metrics.read': async (p, ctx) =>
      db.metricSnapshot.findMany({
        where: { workspaceId: ctx.workspaceId, taskId: ctx.taskId },
        select: { id: true, metricKey: true, status: true, value: true, unit: true, currency: true, notes: true },
      }).then((rows) => ({ range: p, rows })),
    'products.lookup': async (p, ctx) => {
      const variants = await db.variant.findMany({ where: { workspaceId: ctx.workspaceId, sku: { in: p.skus } } });
      const inv = await db.inventorySnapshot.findMany({ where: { workspaceId: ctx.workspaceId, sku: { in: p.skus } }, orderBy: { capturedAt: 'desc' } });
      return { variants, inventory: inv };
    },
    'knowledge.search': async (p, ctx) => {
      const docs = await db.knowledgeDocument.findMany({
        where: { workspaceId: ctx.workspaceId, OR: [{ title: { contains: p.query, mode: 'insensitive' } }, { body: { contains: p.query, mode: 'insensitive' } }] },
        select: { slug: true, title: true, status: true, body: true },
        take: 5,
      });
      return docs.map((d) => ({ ...d, binding: d.status === 'published' }));
    },
    'tasks.recent': async (p, ctx) =>
      db.task.findMany({
        where: { workspaceId: ctx.workspaceId, updatedAt: { gte: new Date(p.sinceIso) } },
        select: { id: true, title: true, status: true, agentRole: true, failureReason: true },
        take: 50,
      }),
    'proposal.create': async (p, ctx) => {
      const expiresAt = new Date(Date.now() + 24 * 3600e3);
      const bound = { provider: p.provider, accountRef: 'onbekend', targetObject: p.targetObject, operation: p.operation, payload: p.payload, preconditions: {}, expiresAt: expiresAt.toISOString() };
      return db.actionProposal.create({
        data: {
          workspaceId: ctx.workspaceId, ...bound, payload: p.payload as Prisma.InputJsonValue, preconditions: {}, expiresAt,
          payloadHash: proposalHash(bound), risk: 'onbeoordeeld', status: 'draft', sourceTaskId: ctx.taskId,
        },
      });
    },
  };
}
