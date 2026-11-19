import { CONNECTORS, type Provider } from '@jc/connectors';
import { getPrisma } from '@jc/db';
import ActionButton from '@/components/ActionButton';
import ScheduleRow from '@/components/ScheduleRow';
import { fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const s = (await getSession())!;
  const db = getPrisma();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } });
  const conns = await db.connection.findMany({ where: { workspaceId: s.workspaceId } });
  const schedules = await db.schedule.findMany({ where: { workspaceId: s.workspaceId }, orderBy: { timeOfDay: 'asc' } });
  const docs = await db.knowledgeDocument.findMany({ where: { workspaceId: s.workspaceId }, orderBy: { slug: 'asc' } });
  const audit = await db.auditEvent.findMany({ where: { workspaceId: s.workspaceId }, orderBy: { createdAt: 'desc' }, take: 15 });
  const isOwner = s.role === 'owner';
  const cmva = conns.find((c) => c.provider === 'cmva');
  const cmvaSchedule = schedules.find((sc) => sc.key === 'cmva_sync');
  const ollama = process.env.MODEL_PROVIDER === 'ollama';
  const real = process.env.MODEL_PROVIDER === 'anthropic' && process.env.ALLOW_REAL_MODEL_RUNS === 'true';
  return (
    <>
      <h1>Instellingen</h1>
      <div className="grid two">
        <section className="card">
          <h2>Workspace</h2>
          <p className="small">
            {ws.name} · rapportagezone <strong>{ws.reportingTimezone}</strong> · winkelvaluta <strong>{ws.shopCurrency ?? 'onbekend'}</strong>{' '}
            {!ws.currencyConfirmed && <span className="badge partial">nog te bevestigen</span>}
          </p>
          <h2>Noodstop</h2>
          <p className="small">Blokkeert nieuwe modeltaken en geplande runs. Audit en beveiliging blijven werken.</p>
          <ActionButton url="/api/settings/emergency-stop" body={{ active: !ws.emergencyStop }} label={ws.emergencyStop ? 'Noodstop opheffen' : 'Noodstop activeren'} className={ws.emergencyStop ? 'primary' : 'danger'} disabled={!isOwner} />
          <h2>Modeladapter</h2>
          <p className="small">
            Actief: <strong>{ollama ? `Ollama (${process.env.OLLAMA_MODEL || 'hermes3'}, lokaal op CPU)` : real ? `Anthropic (${process.env.MODEL_ALIAS})` : 'mockadapter (deterministisch, geen netwerk, geen kosten)'}</strong>. Anthropic-runs vereisen{' '}
            <code>MODEL_PROVIDER=anthropic</code>, <code>ALLOW_REAL_MODEL_RUNS=true</code>, een serverzijdige <code>ANTHROPIC_API_KEY</code> en een dagbudget (<code>MODEL_DAILY_BUDGET_USD</code>
            ={process.env.MODEL_DAILY_BUDGET_USD ?? '5'}). Max. 2 modelruns tegelijk.
          </p>
        </section>
        <section className="card">
          <h2>Planning</h2>
          <table>
            <thead><tr><th>Schema</th><th>Tijd</th><th>Actief</th><th>Zone</th><th /></tr></thead>
            <tbody>{schedules.filter((sc) => sc.key !== 'cmva_sync').map((sc) => <ScheduleRow key={sc.id} s={sc} canEdit={isOwner} />)}</tbody>
          </table>
          <p className="small muted">Productdefaults: 09:00 dagstart, 13:00 voortgang, 16:30 dagafsluiting, 08:15 ochtendbrief — werkdagen. Geen externe agenda-afspraken.</p>
        </section>
      </div>
      <h2>Koppelingen</h2>
      <section className="card" data-testid="connection-cmva">
        <div className="row"><strong>cmva</strong><span className={`badge ${cmva?.status === 'connected' ? 'ok' : 'partial'}`}>{cmva?.status ?? 'action_required'}</span></div>
        <p className="small">Alleen lezen: opgeslagen dagcijfers, totalen, producten en kosten. {cmva?.accountRef ? `Profiel: ${cmva.accountRef}.` : 'Nog geen winkelprofiel gekoppeld.'}</p>
        <p className="small">Laatste leesproef: {cmva?.lastProbeAt ? fmtTime(cmva.lastProbeAt) : 'nog niet uitgevoerd'}. {cmva?.lastError}</p>
        <p className="small">Bronvaluta EUR; winkel AUD (Australia/Sydney). Wisselkoers en jaartal in de bron zijn open punten. Bedragen worden niet omgerekend.</p>
        <p className="small">Uurschema: {cmvaSchedule ? (cmvaSchedule.enabled ? 'actief, elk heel uur (UTC)' : 'uitgeschakeld') : 'wordt bij de eerste handmatige sync ingesteld'}.</p>
        <ActionButton url="/api/settings/cmva/sync" label="CMVA synchroniseren" disabled={s.role === 'viewer'} testId="cmva-sync" />
      </section>
      <div className="grid two">
        {conns.filter((c) => c.provider !== 'cmva').map((c) => {
          const k = CONNECTORS[c.provider as Provider];
          return (
            <section key={c.id} className="card" data-testid={`connection-${c.provider}`}>
              <div className="row">
                <strong>{k?.label ?? c.provider}</strong>
                <span className="badge demo">{c.status === 'demo_not_connected' ? 'demo/niet gekoppeld' : c.status}</span>
              </div>
              <p className="small muted">Geen livekoppeling: er is geen geslaagde API-proef. Data is fixture.</p>
              <p className="small">Capabilities (alleen lezen): {k?.capabilities().map((x) => x.resource).join(', ')}</p>
              <details className="small">
                <summary>Verplichte regels voor de echte koppeling</summary>
                <ul>{k?.implementationRules.map((r) => <li key={r}>{r}</li>)}</ul>
              </details>
            </section>
          );
        })}
      </div>
      <h2>Kennis</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Document</th><th>Status</th><th>Bron</th><th>Bijgewerkt</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}><td>{d.title}</td><td><span className={`badge ${d.status === 'published' ? 'ok' : 'partial'}`}>{d.status}</span></td><td>{d.source}</td><td>{fmtTime(d.updatedAt)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Alleen gepubliceerde kennis is bindend. Alle merk- en beleidsinformatie van Julie &amp; Claire is nog onbekend.</p>
      </div>
      <h2>Auditlog</h2>
      <ul className="clean card small">{audit.map((a) => <li key={a.id}><span className="mono">{a.action}</span> {a.target ?? ''} · {a.actorId ?? 'systeem'} · {fmtTime(a.createdAt)}</li>)}</ul>
    </>
  );
}
