// Deterministische metricfuncties. Contractversie wordt bij elke snapshot opgeslagen.
// Zie docs/metric-contracts.md voor de volledige definities.
import { divideMinorRound } from './money';
import { localDatesInPeriod, type Period } from './time';

export const METRIC_CONTRACT_VERSION = '2026-11-19.1';

export const METRIC_LABELS: Record<string, string> = {
  net_product_revenue: 'Netto productomzet',
  order_count: 'Orders',
  aov: 'Gemiddelde orderwaarde (AOV)',
  meta_spend: 'Meta-spend',
  revenue_per_meta_spend: 'Omzet / Meta-spend',
  meta_roas: 'Meta-ROAS (door Meta toegeschreven)',
  klaviyo_attributed_revenue: 'Klaviyo-toegeschreven omzet',
  contribution_margin_after_ads: 'Bijdragemarge na ads',
  conversion_rate: 'Conversieratio',
};

export interface OrderInput {
  id: string;
  createdAt: Date;
  cancelledAt: Date | null;
  isTest: boolean;
  currency: string;
  lines: { id: string; sku: string; quantity: number; unitPriceExVatMinor: number; discountExVatMinor: number }[];
}
export interface RefundLineInput {
  id: string;
  orderId: string;
  sku: string;
  amountExVatMinor: number;
  refundedAt: Date;
}
export interface AdInsightInput {
  id: string;
  dateLocal: string;
  accountTimezone: string;
  currency: string;
  level: string;
  spendMinor: number;
  purchaseValueMinor: number;
  attributionWindow: string;
}
export interface CostInput {
  sku: string;
  kind: string;
}
export interface KlaviyoInput {
  id: string;
  attributedRevenueMinor: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}

export type MetricStatus = 'ok' | 'partial' | 'unknown';

export interface MetricResult {
  key: string;
  label: string;
  status: MetricStatus;
  value: number | null;
  unit: 'minor' | 'ratio' | 'count';
  currency: string | null;
  formula: string;
  numerator: number | null;
  denominator: number | null;
  filters: Record<string, unknown>;
  sourceRecordIds: string[];
  notes: string[];
}

export interface MetricInputs {
  period: Period;
  shopCurrency: string;
  orders: OrderInput[];
  refundLines: RefundLineInput[];
  adInsights: AdInsightInput[];
  costs: CostInput[];
  klaviyo: KlaviyoInput[];
  /** Is er een gevalideerde, bijpassende sessiebron voor conversie? Fase 1: nee. */
  validatedSessionSource: boolean;
}

function inPeriod(d: Date, p: Period): boolean {
  return d.getTime() >= p.startUtc.getTime() && d.getTime() < p.endUtc.getTime();
}

/** Orderpopulatie: aangemaakt in periode, niet geannuleerd, geen testorder, juiste valuta. */
export function orderPopulation(inputs: MetricInputs) {
  const included: OrderInput[] = [];
  const excluded: { id: string; reason: string }[] = [];
  for (const o of inputs.orders) {
    if (!inPeriod(o.createdAt, inputs.period)) continue;
    if (o.isTest) excluded.push({ id: o.id, reason: 'testorder' });
    else if (o.cancelledAt) excluded.push({ id: o.id, reason: 'geannuleerd' });
    else if (o.currency !== inputs.shopCurrency) excluded.push({ id: o.id, reason: `andere valuta (${o.currency})` });
    else included.push(o);
  }
  return { included, excluded };
}

export function netProductRevenue(inputs: MetricInputs): MetricResult {
  const { included, excluded } = orderPopulation(inputs);
  let gross = 0;
  let discounts = 0;
  const ids: string[] = [];
  for (const o of included) {
    ids.push(o.id);
    for (const l of o.lines) {
      gross += l.quantity * l.unitPriceExVatMinor;
      discounts += l.discountExVatMinor;
    }
  }
  // Retouren tellen op retourboekingsdatum (refundedAt) binnen de periode, ongeacht orderdatum,
  // maar niet voor test-, geannuleerde of anders-valuta orders.
  const orderById = new Map(inputs.orders.map((o) => [o.id, o]));
  let refunds = 0;
  for (const r of inputs.refundLines) {
    if (!inPeriod(r.refundedAt, inputs.period)) continue;
    const o = orderById.get(r.orderId);
    if (!o || o.isTest || o.cancelledAt || o.currency !== inputs.shopCurrency) continue;
    refunds += r.amountExVatMinor;
    ids.push(r.id);
  }
  const value = gross - discounts - refunds;
  const notes = [
    'Exclusief btw en verzendkosten.',
    'Retouren op retourboekingsdatum.',
    ...excluded.map((e) => `Order ${e.id} uitgesloten: ${e.reason}.`),
  ];
  return {
    key: 'net_product_revenue',
    label: 'Netto productomzet',
    status: 'ok',
    value,
    unit: 'minor',
    currency: inputs.shopCurrency,
    formula: 'Σ(aantal × stukprijs excl. btw) − Σ kortingen excl. btw − Σ productretouren excl. btw (op retourdatum)',
    numerator: null,
    denominator: null,
    filters: { grossMinor: gross, discountsMinor: discounts, refundsMinor: refunds, excludedOrders: excluded },
    sourceRecordIds: ids,
    notes,
  };
}

export function orderCount(inputs: MetricInputs): MetricResult {
  const { included, excluded } = orderPopulation(inputs);
  return {
    key: 'order_count',
    label: 'Orders',
    status: 'ok',
    value: included.length,
    unit: 'count',
    currency: null,
    formula: 'Aantal orders aangemaakt in periode, excl. test, geannuleerd en andere valuta',
    numerator: null,
    denominator: null,
    filters: { excludedOrders: excluded },
    sourceRecordIds: included.map((o) => o.id),
    notes: [],
  };
}

export function averageOrderValue(inputs: MetricInputs): MetricResult {
  const rev = netProductRevenue(inputs);
  const cnt = orderCount(inputs);
  const n = cnt.value ?? 0;
  if (n === 0) {
    return {
      key: 'aov',
      label: 'Gemiddelde orderwaarde (AOV)',
      status: 'unknown',
      value: null,
      unit: 'minor',
      currency: inputs.shopCurrency,
      formula: 'Netto productomzet / aantal orders (zelfde populatie)',
      numerator: rev.value,
      denominator: 0,
      filters: {},
      sourceRecordIds: rev.sourceRecordIds,
      notes: ['Geen orders in periode: AOV niet te berekenen.'],
    };
  }
  const refunds = (rev.filters.refundsMinor as number) ?? 0;
  return {
    key: 'aov',
    label: 'Gemiddelde orderwaarde (AOV)',
    status: 'ok',
    value: divideMinorRound(rev.value ?? 0, n),
    unit: 'minor',
    currency: inputs.shopCurrency,
    formula: 'Netto productomzet / aantal orders (zelfde populatie), half-up afgerond op minor units',
    numerator: rev.value,
    denominator: n,
    filters: {},
    sourceRecordIds: rev.sourceRecordIds,
    notes: [
      `Effect van retouren in teller: −${refunds} minor units. Retouren op orders van vóór de periode verlagen de AOV van deze periode.`,
    ],
  };
}

export function metaSpend(inputs: MetricInputs): MetricResult {
  const dates = new Set(localDatesInPeriod(inputs.period));
  const rows = inputs.adInsights.filter((a) => a.level === 'account' && dates.has(a.dateLocal));
  const notes: string[] = [];
  let status: MetricStatus = rows.length ? 'ok' : 'unknown';
  const tzs = new Set(rows.map((r) => r.accountTimezone));
  if ([...tzs].some((tz) => tz !== inputs.period.timezone)) {
    status = 'partial';
    notes.push(
      `Meta-accounttijdzone (${[...tzs].join(', ')}) wijkt af van rapportagezone ${inputs.period.timezone}: dagen sluiten niet exact aan.`,
    );
  }
  const wrongCur = rows.filter((r) => r.currency !== inputs.shopCurrency);
  if (wrongCur.length) {
    status = 'partial';
    notes.push(`${wrongCur.length} rijen in andere valuta uitgesloten (geen wisselkoers vastgelegd).`);
  }
  const used = rows.filter((r) => r.currency === inputs.shopCurrency);
  const missingDays = [...dates].filter((d) => !used.some((r) => r.dateLocal === d));
  if (rows.length && missingDays.length) {
    status = 'partial';
    notes.push(`Geen Meta-data voor: ${missingDays.join(', ')}.`);
  }
  if (!rows.length) notes.push('Geen Meta-data voor deze periode.');
  return {
    key: 'meta_spend',
    label: 'Meta-spend',
    status,
    value: rows.length ? used.reduce((s, r) => s + r.spendMinor, 0) : null,
    unit: 'minor',
    currency: inputs.shopCurrency,
    formula: 'Σ spend op accountniveau per accountdag binnen de periode',
    numerator: null,
    denominator: null,
    filters: { level: 'account', attributionWindows: [...new Set(used.map((r) => r.attributionWindow))] },
    sourceRecordIds: used.map((r) => r.id),
    notes,
  };
}

export function revenuePerMetaSpend(inputs: MetricInputs): MetricResult {
  const rev = netProductRevenue(inputs);
  const spend = metaSpend(inputs);
  const base = {
    key: 'revenue_per_meta_spend',
    label: 'Omzet / Meta-spend',
    unit: 'ratio' as const,
    currency: null,
    formula: 'Netto productomzet / Meta-spend (géén volledige MER: alleen Meta-kosten gekoppeld)',
    filters: {},
    sourceRecordIds: [...rev.sourceRecordIds, ...spend.sourceRecordIds],
  };
  if (spend.value === null || spend.value === 0) {
    return {
      ...base,
      status: 'unknown',
      value: null,
      numerator: rev.value,
      denominator: spend.value,
      notes: ['Geen of nul Meta-spend: ratio niet te berekenen.', ...spend.notes],
    };
  }
  return {
    ...base,
    status: spend.status === 'ok' ? 'ok' : 'partial',
    value: Math.round(((rev.value ?? 0) / spend.value) * 100) / 100,
    numerator: rev.value,
    denominator: spend.value,
    notes: ['Alleen Meta-spend in noemer; andere marketingkosten ontbreken.', ...spend.notes],
  };
}

export function metaRoas(inputs: MetricInputs): MetricResult {
  const spend = metaSpend(inputs);
  const dates = new Set(localDatesInPeriod(inputs.period));
  const rows = inputs.adInsights.filter(
    (a) => a.level === 'account' && dates.has(a.dateLocal) && a.currency === inputs.shopCurrency,
  );
  const value = rows.reduce((s, r) => s + r.purchaseValueMinor, 0);
  const ok = spend.value !== null && spend.value > 0;
  return {
    key: 'meta_roas',
    label: 'Meta-ROAS (door Meta toegeschreven)',
    status: ok ? spend.status : 'unknown',
    value: ok ? Math.round((value / (spend.value as number)) * 100) / 100 : null,
    unit: 'ratio',
    currency: null,
    formula: 'Door Meta toegeschreven purchase value / Meta-spend, onder opgeslagen attributie-instellingen',
    numerator: value,
    denominator: spend.value,
    filters: { attributionWindows: [...new Set(rows.map((r) => r.attributionWindow))] },
    sourceRecordIds: rows.map((r) => r.id),
    notes: ['Meta-attributie wordt nooit opgeteld bij Klaviyo-attributie of winkelomzet.', ...spend.notes],
  };
}

export function klaviyoAttributedRevenue(inputs: MetricInputs): MetricResult {
  const rows = inputs.klaviyo.filter(
    (k) => k.periodStart >= inputs.period.startUtc && k.periodEnd <= inputs.period.endUtc,
  );
  return {
    key: 'klaviyo_attributed_revenue',
    label: 'Klaviyo-toegeschreven omzet',
    status: rows.length ? 'ok' : 'unknown',
    value: rows.length ? rows.reduce((s, r) => s + r.attributedRevenueMinor, 0) : null,
    unit: 'minor',
    currency: inputs.shopCurrency,
    formula: 'Σ door Klaviyo toegeschreven omzet (campagnes + flows) binnen periode',
    numerator: null,
    denominator: null,
    filters: {},
    sourceRecordIds: rows.map((r) => r.id),
    notes: ['Afzonderlijke attributie; overlapt met Meta en winkelomzet en mag daar niet bij opgeteld worden.'],
  };
}

export function contributionMargin(inputs: MetricInputs): MetricResult {
  const { included } = orderPopulation(inputs);
  const skus = new Set(included.flatMap((o) => o.lines.map((l) => l.sku)));
  const withCogs = new Set(inputs.costs.filter((c) => c.kind === 'cogs').map((c) => c.sku));
  const missing = [...skus].filter((s) => !withCogs.has(s));
  const missingKinds = ['fulfillment', 'shipping', 'payment_fee'].filter(
    (k) => !inputs.costs.some((c) => c.kind === k),
  );
  return {
    key: 'contribution_margin_after_ads',
    label: 'Bijdragemarge na ads',
    status: 'unknown',
    value: null,
    unit: 'minor',
    currency: inputs.shopCurrency,
    formula: 'Netto productomzet + netto verzendopbrengst − kostprijs − fulfillment − verzending − betaalfees − spend',
    numerator: null,
    denominator: null,
    filters: {},
    sourceRecordIds: [],
    notes: [
      missing.length ? `Kostprijs ontbreekt voor SKU’s: ${missing.join(', ')}.` : 'Kostprijzen aanwezig.',
      missingKinds.length ? `Ontbrekende kostensoorten: ${missingKinds.join(', ')}.` : '',
      'Marge blijft onbekend tot alle kosten zijn vastgelegd.',
    ].filter(Boolean),
  };
}

export function conversionRate(inputs: MetricInputs): MetricResult {
  return {
    key: 'conversion_rate',
    label: 'Conversieratio',
    status: 'unknown',
    value: null,
    unit: 'ratio',
    currency: null,
    formula: 'Orders / sessies uit een gevalideerde, bijpassende sessiebron',
    numerator: null,
    denominator: null,
    filters: {},
    sourceRecordIds: [],
    notes: [
      inputs.validatedSessionSource
        ? 'Sessiebron aanwezig maar conversie nog niet geïmplementeerd.'
        : 'Geen gevalideerde sessiebron. Clarity-sessies zijn geen vervangende Shopify-conversienoemer.',
    ],
  };
}

export function computeAllMetrics(inputs: MetricInputs): MetricResult[] {
  return [
    netProductRevenue(inputs),
    orderCount(inputs),
    averageOrderValue(inputs),
    metaSpend(inputs),
    revenuePerMetaSpend(inputs),
    metaRoas(inputs),
    klaviyoAttributedRevenue(inputs),
    contributionMargin(inputs),
    conversionRate(inputs),
  ];
}
