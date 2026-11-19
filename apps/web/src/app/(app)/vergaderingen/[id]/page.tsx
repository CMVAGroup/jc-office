import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrisma } from '@jc/db';
import { ROLE_LABELS, type AgentRole, type MeetingSynthesis } from '@jc/domain';
import { fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Item = { text: string; taskId: string };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const db = getPrisma();
  const m = await db.meeting.findFirst({
    where: { id, workspaceId: s.workspaceId },
    include: { updates: { orderBy: { order: 'asc' } }, actions: true, participants: true },
  });
  if (!m) notFound();
  const syn = m.synthesis as MeetingSynthesis | null;
  const list = (items: Item[]) =>
    items.length ? items.map((i) => <li key={i.taskId + i.text}><Link href={`/taken/${i.taskId}`} data-testid="update-task-link">{i.text}</Link></li>) : <li className="muted">—</li>;
  return (
    <>
      <h1>{m.title}</h1>
      <p className="small muted">
        Gepland {fmtTime(m.plannedAt)} · gestart {fmtTime(m.startedAt)} · updates sinds {fmtTime(m.sinceAt)} · status {m.status} {m.isDemo && <span className="badge demo">demo</span>} {m.late && <span className="badge">verlaat</span>}
      </p>
      <section className="card">
        <h2>Synthese van de baas</h2>
        {syn ? (
          <>
            <p>{syn.summary}</p>
            <h3>Prioriteiten (max. 3)</h3>
            <ol>{syn.priorities.map((p) => <li key={p.title}>{p.title} — <strong>{ROLE_LABELS[p.ownerRole]}</strong> {p.deadline ? `· deadline ${p.deadline}` : ''} {p.evidence.map((e) => e.kind === 'task' ? <Link key={e.id} href={`/taken/${e.id}`} className="badge">taak</Link> : <span key={e.id} className="badge">{e.label ?? e.kind}</span>)}</li>)}</ol>
            <h3>Actiehouders</h3>
            <ul>{m.actions.filter((a) => a.kind === 'action').map((a) => <li key={a.id}>{ROLE_LABELS[a.ownerRole as AgentRole] ?? a.ownerRole}: {a.description}</li>)}</ul>
            <h3>Beslispunten voor de eigenaar</h3>
            <ul>{m.actions.filter((a) => a.kind === 'owner_decision').map((a) => <li key={a.id}>{a.description}</li>)}{!m.actions.some((a) => a.kind === 'owner_decision') && <li className="muted">Geen</li>}</ul>
            <p className="small muted">Deze vergadering geeft geen toestemming voor externe wijzigingen (externalWritesAuthorized = false).</p>
          </>
        ) : (
          <p className="alert-box card">{m.synthesisError ?? 'Geen synthese.'}</p>
        )}
      </section>
      <h2>Updates per agent</h2>
      <div className="grid two">
        {m.updates.map((u) => (
          <section key={u.id} className="card" data-testid="meeting-update">
            <h3>{ROLE_LABELS[u.agentRole as AgentRole] ?? u.agentRole} {u.staleInput && <span className="badge partial">verouderde input</span>}</h3>
            <p className="small">{u.text}</p>
            <div className="small"><strong>Afgerond</strong><ul>{list(u.done as Item[])}</ul></div>
            <div className="small"><strong>Huidig</strong><ul>{list(u.current as Item[])}</ul></div>
            <div className="small"><strong>Obstakels</strong><ul>{list(u.blockers as Item[])}</ul></div>
            <div className="small"><strong>Volgende stap:</strong> {u.nextStep}</div>
          </section>
        ))}
      </div>
      <details className="card" style={{ marginTop: '0.75rem' }}>
        <summary>Gebruikte snapshot</summary>
        <pre className="payload">{JSON.stringify(m.snapshot, null, 2)}</pre>
      </details>
    </>
  );
}
