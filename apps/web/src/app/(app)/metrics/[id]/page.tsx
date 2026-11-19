import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrisma } from '@jc/db';
import { fmtMetric, fmtTime } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MetricPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  const db = getPrisma();
  const m = await db.metricSnapshot.findFirst({ where: { id, workspaceId: s.workspaceId } });
  if (!m) notFound();
  const orders = await db.order.findMany({ where: { workspaceId: s.workspaceId, id: { in: m.sourceRecordIds } }, include: { lines: true }, take: 100 });
  const refunds = await db.refundLine.findMany({ where: { workspaceId: s.workspaceId, id: { in: m.sourceRecordIds } } });
  const ads = await db.adInsight.findMany({ where: { workspaceId: s.workspaceId, id: { in: m.sourceRecordIds } } });
  return (
    <>
      <h1>Metric: {m.metricKey}</h1>
      <div className="card">
        <p><strong>Waarde:</strong> {fmtMetric(m.value, m.unit, m.currency)} <span className={`badge ${m.status}`}>{m.status}</span> {m.isDemo && <span className="badge demo">demo</span>}</p>
        <p><strong>Formule:</strong> {m.formula}</p>
        {m.denominator !== null && <p><strong>Teller / noemer:</strong> {m.numerator} / {m.denominator}</p>}
        <p><strong>Periode:</strong> {fmtTime(m.periodStart)} – {fmtTime(m.periodEnd)} ({m.timezone}, halfopen interval)</p>
        <p className="small muted">Contractversie {m.contractVersion} · berekend {fmtTime(m.computedAt)} {m.taskId && <>· <Link href={`/taken/${m.taskId}`}>taak</Link></>}</p>
        <ul>{m.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <details>
          <summary>Filters</summary>
          <pre className="payload">{JSON.stringify(m.filters, null, 2)}</pre>
        </details>
      </div>
      <h2>Onderliggende bronrecords ({m.sourceRecordIds.length})</h2>
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Type</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}><td>order</td><td>{o.name}</td><td>{fmtTime(o.createdAtSource)} · {o.lines.map((l) => `${l.quantity}× ${l.sku} à ${l.unitPriceExVatMinor} − korting ${l.discountExVatMinor}`).join('; ')} (minor units, excl. btw)</td></tr>
            ))}
            {refunds.map((r) => (
              <tr key={r.id}><td>refund</td><td>{r.externalId}</td><td>{fmtTime(r.refundedAt)} · {r.sku} −{r.amountExVatMinor}</td></tr>
            ))}
            {ads.map((a) => (
              <tr key={a.id}><td>meta</td><td>{a.dateLocal}</td><td>spend {a.spendMinor} {a.currency} · {a.attributionWindow} · {a.actionReportTime} · zone {a.accountTimezone}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
