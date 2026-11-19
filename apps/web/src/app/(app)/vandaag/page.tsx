import Link from 'next/link';
import { getPrisma } from '@jc/db';
import type { MorningBrief } from '@jc/domain';
import ActionButton from '@/components/ActionButton';
import { fmtMetric, fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ORDER = ['order_count', 'net_product_revenue', 'aov', 'meta_spend', 'revenue_per_meta_spend', 'meta_roas', 'klaviyo_attributed_revenue', 'contribution_margin_after_ads', 'conversion_rate'];
const LABELS: Record<string, string> = {
  order_count: 'Orders', net_product_revenue: 'Netto productomzet', aov: 'AOV', meta_spend: 'Meta-spend', revenue_per_meta_spend: 'Omzet / Meta-spend',
  meta_roas: 'Meta-ROAS (Meta-attributie)', klaviyo_attributed_revenue: 'Klaviyo-omzet (Klaviyo-attributie)', contribution_margin_after_ads: 'Bijdragemarge na ads', conversion_rate: 'Conversieratio',
};

export default async function TodayPage() {
  const s = (await getSession())!;
  const db = getPrisma();
  const brief = await db.task.findFirst({ where: { workspaceId: s.workspaceId, type: 'morning_brief', status: 'succeeded' }, orderBy: { finishedAt: 'desc' } });
  const art = brief?.resultArtifactId ? await db.artifact.findFirst({ where: { id: brief.resultArtifactId, workspaceId: s.workspaceId } }) : null;
  const content = art?.content as unknown as MorningBrief | undefined;
  const child = brief ? await db.task.findFirst({ where: { parentTaskId: brief.id } }) : null;
  const snaps = child ? await db.metricSnapshot.findMany({ where: { taskId: child.id, workspaceId: s.workspaceId } }) : [];
  const byKey = new Map(snaps.filter((x) => !x.metricKey.includes('__')).map((x) => [x.metricKey, x]));
  const inv = await db.inventorySnapshot.findMany({ where: { workspaceId: s.workspaceId, available: { lt: 10 } }, orderBy: { capturedAt: 'desc' } });
  const conns = await db.connection.findMany({ where: { workspaceId: s.workspaceId } });
  const canAct = s.role !== 'viewer';

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Vandaag</h1>
        <ActionButton url="/api/tasks" body={{ type: 'morning_brief' }} label="Maak ochtendbrief" className="primary" disabled={!canAct} />
      </div>
      {!content ? (
        <p className="card">Nog geen ochtendbrief. Start er een via de knop of wacht op de geplande run (werkdagen 08:15).</p>
      ) : (
        <>
          <p className="muted small">
            Periode {content.period.from}
            {content.period.to !== content.period.from ? ` t/m ${content.period.to}` : ''} ({content.period.timezone}) · brief van {fmtTime(brief!.finishedAt)} ·{' '}
            <Link href={`/taken/${brief!.id}`}>volledig resultaat</Link> {content.isDemo && <span className="badge demo">demo</span>}
          </p>
          <section className="grid kpi" aria-label="KPI’s">
            {ORDER.map((k) => {
              const m = byKey.get(k);
              if (!m) return null;
              return (
                <Link key={k} href={`/metrics/${m.id}`} className="card kpi-tile" data-testid={`kpi-${k}`}>
                  <div className="l">{LABELS[k]}</div>
                  <div className="v">{fmtMetric(m.value, m.unit, m.currency)}</div>
                  <span className={`badge ${m.status}`}>{m.status === 'ok' ? 'berekend' : m.status === 'partial' ? 'gedeeltelijk' : 'onbekend'}</span>
                </Link>
              );
            })}
          </section>
          <h2>Prioriteiten (max. 3)</h2>
          <ol>
            {content.priorities.map((p) => (
              <li key={p.title} className="card" style={{ marginBottom: '0.5rem' }}>
                <strong>{p.title}</strong> <span className="badge">{p.ownerRole}</span>
                <div className="small">{p.rationale}</div>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="grid two">
        <section className="card">
          <h2>Freshness per bron</h2>
          <table>
            <thead><tr><th>Bron</th><th>Status</th><th>Laatste import</th></tr></thead>
            <tbody>
              {conns.map((c) => (
                <tr key={c.provider}>
                  <td>{c.provider}</td>
                  <td><span className="badge demo">{c.status === 'demo_not_connected' ? 'demo/niet gekoppeld' : c.status}</span></td>
                  <td>{content?.freshness.find((f) => f.source === c.provider)?.fetchedAt ? fmtTime(content.freshness.find((f) => f.source === c.provider)!.fetchedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Voorraadalerts (&lt; 10)</h2>
          <ul className="clean">
            {[...new Map(inv.map((i) => [i.sku, i])).values()].map((i) => (
              <li key={i.id}>{i.sku}: {i.available} stuks <span className="muted small">({fmtTime(i.capturedAt)})</span> {i.isDemo && <span className="badge demo">demo</span>}</li>
            ))}
          </ul>
        </section>
      </div>
      {content && (
        <section className="card" style={{ marginTop: '0.75rem' }}>
          <h2>Ontbrekende data en aannames</h2>
          <ul>{content.missingData.map((m) => <li key={m}>{m}</li>)}</ul>
          <ul className="muted small">{content.assumptions.map((m) => <li key={m}>{m}</li>)}</ul>
        </section>
      )}
    </>
  );
}
