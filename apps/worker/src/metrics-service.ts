// Laadt brondata uit de database, berekent metrics met de geteste domeinfuncties en slaat snapshots op.
import type { MetricView } from '@jc/agents';
import { Prisma, type Db } from '@jc/db';
import {
  addDaysLocal,
  computeAllMetrics,
  localDateString,
  METRIC_CONTRACT_VERSION,
  periodFromLocalDates,
  type MetricInputs,
  type MetricResult,
  type Period,
} from '@jc/domain';

export async function loadMetricInputs(db: Db, workspaceId: string, period: Period): Promise<MetricInputs> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  // Ruim venster laden zodat retouren op orders van vóór de periode meetellen.
  const orders = await db.order.findMany({
    where: { workspaceId, createdAtSource: { lt: period.endUtc, gte: new Date(period.startUtc.getTime() - 90 * 864e5) } },
    include: { lines: true },
  });
  const refundLines = await db.refundLine.findMany({
    where: { workspaceId, refundedAt: { gte: period.startUtc, lt: period.endUtc } },
  });
  const adInsights = await db.adInsight.findMany({ where: { workspaceId, dateLocal: { gte: period.fromLocal, lte: period.toLocal } } });
  const costs = await db.costEntry.findMany({ where: { workspaceId } });
  const klaviyo = await db.klaviyoReport.findMany({ where: { workspaceId, periodStart: { gte: period.startUtc }, periodEnd: { lte: period.endUtc } } });
  return {
    period,
    shopCurrency: ws.shopCurrency ?? 'EUR',
    orders: orders.map((o) => ({ id: o.id, createdAt: o.createdAtSource, cancelledAt: o.cancelledAt, isTest: o.isTest, currency: o.currency, lines: o.lines })),
    refundLines,
    adInsights,
    costs,
    klaviyo,
    validatedSessionSource: false,
  };
}

async function store(db: Db, workspaceId: string, m: MetricResult, period: Period, taskId: string | null, isDemo: boolean, keyOverride?: string) {
  return db.metricSnapshot.create({
    data: {
      workspaceId,
      metricKey: keyOverride ?? m.key,
      status: m.status,
      value: m.value,
      unit: m.unit,
      currency: m.currency,
      periodStart: period.startUtc,
      periodEnd: period.endUtc,
      timezone: period.timezone,
      formula: m.formula,
      numerator: m.numerator,
      denominator: m.denominator,
      filters: m.filters as Prisma.InputJsonValue,
      sourceRecordIds: m.sourceRecordIds,
      notes: m.notes,
      contractVersion: METRIC_CONTRACT_VERSION,
      taskId,
      isDemo,
    },
  });
}

function toView(id: string, m: MetricResult): MetricView {
  return { snapshotId: id, key: m.key, label: m.label, status: m.status, value: m.value, unit: m.unit, currency: m.currency, notes: m.notes };
}

export function defaultPeriod(now: Date, tz: string): { fromLocal: string; toLocal: string } {
  const y = addDaysLocal(localDateString(now, tz), -1);
  return { fromLocal: y, toLocal: y };
}

/** Berekent metrics voor de periode plus een 7-daagse basislijn (daggemiddelde) en slaat alles op. */
export async function computeAndStoreMetrics(
  db: Db,
  workspaceId: string,
  range: { fromLocal: string; toLocal: string },
  taskId: string | null,
) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const tz = ws.reportingTimezone;
  const period = periodFromLocalDates(range.fromLocal, range.toLocal, tz);
  const results = computeAllMetrics(await loadMetricInputs(db, workspaceId, period));
  const views: MetricView[] = [];
  for (const r of results) views.push(toView((await store(db, workspaceId, r, period, taskId, ws.isDemo)).id, r));

  const bFrom = addDaysLocal(range.fromLocal, -7);
  const bTo = addDaysLocal(range.fromLocal, -1);
  const bPeriod = periodFromLocalDates(bFrom, bTo, tz);
  const bResults = computeAllMetrics(await loadMetricInputs(db, workspaceId, bPeriod));
  const baseline: { key: string; snapshotId: string; value: number | null; days: number }[] = [];
  for (const r of bResults) {
    if (!['net_product_revenue', 'meta_spend', 'revenue_per_meta_spend', 'aov'].includes(r.key)) continue;
    const perDay = r.unit === 'minor' && (r.key === 'net_product_revenue' || r.key === 'meta_spend');
    const value = r.value === null ? null : perDay ? Math.round(r.value / 7) : r.value;
    const adj: MetricResult = perDay
      ? { ...r, value, label: `${r.label} — daggemiddelde 7 dagen`, formula: `(${r.formula}) / 7 dagen`, notes: [...r.notes, 'Basislijn: daggemiddelde over 7 dagen vóór de periode.'] }
      : { ...r, label: `${r.label} — 7 dagen`, notes: [...r.notes, 'Basislijn: 7 dagen vóór de periode.'] };
    const snap = await store(db, workspaceId, adj, bPeriod, taskId, ws.isDemo, `${r.key}__baseline_7d`);
    baseline.push({ key: r.key, snapshotId: snap.id, value, days: 7 });
  }
  return { period, views, baseline, results };
}

export async function freshnessFor(db: Db, workspaceId: string) {
  const conns = await db.connection.findMany({ where: { workspaceId } });
  const out = [];
  for (const c of conns) {
    const last = await db.syncRun.findFirst({ where: { workspaceId, provider: c.provider, status: 'succeeded' }, orderBy: { finishedAt: 'desc' } });
    out.push({
      source: c.provider,
      fetchedAt: last?.finishedAt?.toISOString() ?? null,
      status: c.status === 'demo_not_connected' ? ('demo' as const) : last ? ('vers' as const) : ('ontbreekt' as const),
      note: c.status === 'demo_not_connected' ? 'Demo/niet gekoppeld — fixturedata' : undefined,
    });
  }
  return out;
}
