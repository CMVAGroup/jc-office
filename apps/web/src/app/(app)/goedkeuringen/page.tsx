import { getPrisma } from '@jc/db';
import ActionButton from '@/components/ActionButton';
import { fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const s = (await getSession())!;
  const db = getPrisma();
  const proposals = await db.actionProposal.findMany({ where: { workspaceId: s.workspaceId }, orderBy: { createdAt: 'desc' }, include: { approvals: true } });
  const isOwner = s.role === 'owner';
  return (
    <>
      <h1>Goedkeuringen</h1>
      <p className="card notice small">
        <strong>Fase 1:</strong> goedkeuren wijzigt uitsluitend de <em>lokale reviewstatus</em>. Er wordt niets extern uitgevoerd — de executor is hard uitgeschakeld en heeft geen
        schrijfcredentials. Alleen de owner kan beslissen.
      </p>
      {proposals.map((p) => {
        const expired = p.expiresAt < new Date();
        return (
          <section key={p.id} className="card" style={{ marginTop: '0.75rem' }} data-testid="proposal">
            <div className="row">
              <strong>{p.operation}</strong> <span className={`badge ${p.status}`} data-testid="proposal-status">{p.status}</span> {p.isDemo && <span className="badge demo">demo</span>}
            </div>
            <table className="small">
              <tbody>
                <tr><th>Provider / account</th><td>{p.provider} · {p.accountRef}</td></tr>
                <tr><th>Doelobject</th><td>{p.targetObject}</td></tr>
                <tr><th>Exacte payload (oud → nieuw)</th><td><pre className="payload">{JSON.stringify(p.payload, null, 2)}</pre></td></tr>
                <tr><th>Preconditions</th><td><pre className="payload">{JSON.stringify(p.preconditions, null, 2)}</pre></td></tr>
                <tr><th>Risico</th><td>{p.risk}</td></tr>
                <tr><th>Payloadhash</th><td className="mono">{p.payloadHash}</td></tr>
                <tr><th>Vervalt</th><td>{fmtTime(p.expiresAt)} {expired && <span className="badge failed">verlopen</span>}</td></tr>
                {p.approvals[0] && <tr><th>Beslissing</th><td>{p.approvals[0].decision} door {p.approvals[0].decidedById} · {fmtTime(p.approvals[0].decidedAt)}</td></tr>}
              </tbody>
            </table>
            {p.status === 'pending_approval' && (
              <div className="row">
                <ActionButton url={`/api/approvals/${p.id}`} body={{ decision: 'approved', payloadHash: p.payloadHash }} label="Goedkeuren (alleen lokale status)" className="primary" disabled={!isOwner} testId="approve" />
                <ActionButton url={`/api/approvals/${p.id}`} body={{ decision: 'rejected', payloadHash: p.payloadHash }} label="Afwijzen" disabled={!isOwner} />
                <ActionButton url={`/api/approvals/${p.id}`} body={{ decision: 'returned', payloadHash: p.payloadHash }} label="Terugsturen" disabled={!isOwner} />
                {!isOwner && <span className="small muted">Alleen de owner kan beslissen.</span>}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
