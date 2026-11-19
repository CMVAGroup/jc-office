import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrisma } from '@jc/db';
import { TERMINAL_STATUSES, type MorningBrief, type TaskResult, type TaskStatus } from '@jc/domain';
import ActionButton from '@/components/ActionButton';
import { fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

function EvidenceLink({ e }: { e: { kind: string; id: string; label?: string } }) {
  const href = e.kind === 'metric_snapshot' ? `/metrics/${e.id}` : e.kind === 'task' ? `/taken/${e.id}` : null;
  const text = e.label ?? `${e.kind}:${e.id.slice(-6)}`;
  return href ? <Link href={href} className="badge">{text}</Link> : <span className="badge" title={`${e.kind}:${e.id}`}>{text}</span>;
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const db = getPrisma();
  const t = await db.task.findFirst({ where: { id, workspaceId: s.workspaceId } });
  if (!t) notFound();
  const events = await db.officeEvent.findMany({ where: { taskId: id, workspaceId: s.workspaceId }, orderBy: { id: 'asc' } });
  const runs = await db.agentRun.findMany({ where: { taskId: id, workspaceId: s.workspaceId }, orderBy: { startedAt: 'asc' } });
  const art = t.resultArtifactId ? await db.artifact.findFirst({ where: { id: t.resultArtifactId, workspaceId: s.workspaceId } }) : null;
  const children = await db.task.findMany({ where: { parentTaskId: id, workspaceId: s.workspaceId } });
  const content = art?.content as unknown as (TaskResult & Partial<MorningBrief>) | undefined;
  const canAct = s.role !== 'viewer';
  return (
    <>
      <h1>{t.title}</h1>
      <div className="card">
        <div className="row">
          <span className={`badge ${t.status}`} data-testid="task-status">{t.status}</span>
          {t.isDemo && <span className="badge demo">demo</span>}
          <span className="small muted">agent {t.agentRole} · type {t.type} · poging {t.attempts}/{t.maxAttempts}</span>
        </div>
        <p className="small">
          In wachtrij {fmtTime(t.queuedAt)} · gestart {fmtTime(t.startedAt)} · laatste heartbeat {fmtTime(t.heartbeatAt)} · laatste voortgang {fmtTime(t.progressAt)}
          {t.progressNote && <> — {t.progressNote}</>}
        </p>
        {t.failureReason && <p className="alert-box card">{t.failureReason}</p>}
        {t.parentTaskId && <p className="small">Deeltaak van <Link href={`/taken/${t.parentTaskId}`}>bovenliggende taak</Link></p>}
        {children.length > 0 && <p className="small">Deeltaken: {children.map((c) => <Link key={c.id} href={`/taken/${c.id}`}>{c.title} ({c.status}) </Link>)}</p>}
        <div className="row">
          {!TERMINAL_STATUSES.has(t.status as TaskStatus) && <ActionButton url={`/api/tasks/${id}/cancel`} label="Annuleren" className="danger" disabled={!canAct} />}
          {(t.status === 'failed' || t.status === 'cancelled') && !t.parentTaskId && <ActionButton url={`/api/tasks/${id}/retry`} label="Gericht opnieuw proberen" disabled={!canAct} />}
        </div>
      </div>

      {content && (
        <section className="card" style={{ marginTop: '0.75rem' }} data-testid="result">
          <h2>Resultaat {content.isDemo && <span className="badge demo">demo</span>}</h2>
          <p>{content.summary}</p>
          <p className="small muted">Periode {content.period.from} t/m {content.period.to} ({content.period.timezone}) · schema {art!.schemaName} v{art!.schemaVersion}</p>
          {content.priorities && (
            <>
              <h3>Prioriteiten</h3>
              <ol data-testid="priorities">
                {content.priorities.map((p) => (
                  <li key={p.title}>
                    <strong>{p.title}</strong> <span className="badge">{p.ownerRole}</span>
                    <div className="small">{p.rationale}</div>
                    <div className="row small">{p.evidence.map((e) => <EvidenceLink key={e.id} e={e} />)}</div>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h3>Feiten</h3>
          <ul>
            {content.facts.map((f) => (
              <li key={f.statement}>
                {f.statement} {f.evidence.map((e) => <EvidenceLink key={e.id} e={e} />)}
              </li>
            ))}
          </ul>
          {content.hypotheses.length > 0 && (
            <>
              <h3>Hypotheses (geen feiten)</h3>
              <ul>{content.hypotheses.map((h) => <li key={h.statement}>{h.statement} <span className="badge">zekerheid {h.confidence}</span> {h.evidence.map((e) => <EvidenceLink key={e.id + h.statement} e={e} />)}</li>)}</ul>
            </>
          )}
          {content.recommendations.length > 0 && <><h3>Aanbevelingen</h3><ul>{content.recommendations.map((r) => <li key={r}>{r}</li>)}</ul></>}
          <div className="grid two">
            <div>
              <h3>Freshness</h3>
              <ul className="small">{content.freshness.map((f) => <li key={f.source}>{f.source}: {f.status} {f.fetchedAt ? `(${fmtTime(f.fetchedAt)})` : ''} {f.note ?? ''}</li>)}</ul>
              <h3>Aannames</h3>
              <ul className="small">{content.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <div>
              <h3>Ontbrekende data</h3>
              <ul className="small" data-testid="missing-data">{content.missingData.map((a) => <li key={a}>{a}</li>)}</ul>
              <h3>Beperkingen</h3>
              <ul className="small">{content.limitations.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          </div>
          <h3>Gebruikte bronrecords ({content.sourceRecords.length})</h3>
          <div className="row small">{content.sourceRecords.map((e) => <EvidenceLink key={e.kind + e.id} e={e} />)}</div>
        </section>
      )}

      <div className="grid two" style={{ marginTop: '0.75rem' }}>
        <section className="card">
          <h2>Agentruns</h2>
          <table>
            <thead><tr><th>Rol</th><th>Model</th><th>Status</th><th>Tokens</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.agentRole}<div className="small muted">{r.promptVersion}</div></td>
                  <td>{r.modelProvider === 'mock' ? 'mock' : `${r.modelProvider}/${r.modelAlias}`}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span>{r.repairAttempted && <span className="badge">herstelpoging</span>}{r.error && <div className="small">{r.error}</div>}</td>
                  <td className="small">{r.inputTokens}/{r.outputTokens} · ${(r.costUsdMicros / 1e6).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Events</h2>
          <ul className="clean small">
            {events.map((e) => <li key={e.id}><span className="mono">{e.kind}</span> · {fmtTime(e.createdAt)}</li>)}
          </ul>
        </section>
      </div>
    </>
  );
}
