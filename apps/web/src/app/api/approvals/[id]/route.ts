import { z } from 'zod';
import { getPrisma, Prisma } from '@jc/db';
import { checkApproval, EXTERNAL_WRITES_PHASE1_DISABLED } from '@jc/policy';
import { json, withAuth } from '@/lib/api';

const Body = z.object({ decision: z.enum(['approved', 'rejected', 'returned']), payloadHash: z.string(), note: z.string().max(500).optional() });

// Fase 1: een beslissing wijzigt uitsluitend de LOKALE reviewstatus. Er wordt niets extern uitgevoerd.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth('approval.decide', async (s) => {
    const b = Body.parse(await req.json());
    const db = getPrisma();
    const p = await db.actionProposal.findFirst({ where: { id, workspaceId: s.workspaceId } });
    if (!p) return json({ error: 'Voorstel niet gevonden' }, 404);
    const ws = await db.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } });
    if (b.decision === 'approved') {
      const check = checkApproval({
        role: s.role,
        proposal: { ...p, expiresAt: p.expiresAt.toISOString() },
        presentedHash: b.payloadHash,
        now: new Date(),
        emergencyStop: ws.emergencyStop,
      });
      if (!check.ok) {
        if (check.reason === 'expired') await db.actionProposal.updateMany({ where: { id, status: 'pending_approval' }, data: { status: 'expired' } });
        return json({ error: check.message, reason: check.reason }, 409);
      }
    } else if (p.status !== 'pending_approval') {
      return json({ error: `Voorstel heeft status ${p.status}` }, 409);
    }
    try {
      // Unieke approval per voorstel + voorwaardelijke statusupdate: dubbelklikken levert één beslissing op.
      const r = await db.$transaction(async (tx) => {
        const upd = await tx.actionProposal.updateMany({ where: { id, status: 'pending_approval', payloadHash: b.payloadHash }, data: { status: b.decision } });
        if (upd.count !== 1) throw new Error('Voorstel is al beoordeeld of gewijzigd');
        await tx.approval.create({ data: { workspaceId: s.workspaceId, proposalId: id, decidedById: s.userId, decision: b.decision, payloadHash: b.payloadHash, note: b.note ?? null } });
        await tx.auditEvent.create({ data: { workspaceId: s.workspaceId, actorId: s.userId, action: `approval.${b.decision}`, target: id, detail: { externalExecution: 'none (fase 1)' } } });
        return tx.actionProposal.findUniqueOrThrow({ where: { id } });
      });
      return json({
        proposal: r,
        executedExternally: false,
        message: EXTERNAL_WRITES_PHASE1_DISABLED ? 'Alleen de lokale reviewstatus is gewijzigd. Er is niets extern uitgevoerd (executor uitgeschakeld in fase 1).' : '',
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return json({ error: 'Voorstel is al beoordeeld' }, 409);
      return json({ error: (e as Error).message }, 409);
    }
  });
}
