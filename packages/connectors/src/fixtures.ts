// DEMOFIXTURES — volledig fictief en overal als demo gemarkeerd.
// Productcategorie en assortiment van Julie & Claire zijn onbekend; daarom neutrale namen ("Demoproduct A").
// Deterministisch (vaste seed) en relatief aan een ankerdatum, zodat 'gisteren' altijd data heeft.
import { addDaysLocal, parseLocalDate, zonedTimeToUtc } from '@jc/domain';

export const FIXTURE_SOURCE_VERSION = 'demo-fixtures-v1';

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export interface FixtureSet {
  products: { externalId: string; title: string; status: string; variants: { externalId: string; sku: string; title: string; priceExVatMinor: number }[] }[];
  inventory: { sku: string; locationRef: string; available: number; capturedAt: Date }[];
  orders: {
    externalId: string;
    name: string;
    createdAt: Date;
    cancelledAt: Date | null;
    isTest: boolean;
    currency: string;
    shippingExVatMinor: number;
    taxMinor: number;
    lines: { externalId: string; sku: string; quantity: number; unitPriceExVatMinor: number; discountExVatMinor: number }[];
  }[];
  refunds: { orderExternalId: string; externalId: string; sku: string; quantity: number; amountExVatMinor: number; refundedAt: Date }[];
  costs: { sku: string; kind: string; amountMinor: number; currency: string; validFrom: Date }[];
  adInsights: {
    accountRef: string;
    level: string;
    externalId: string;
    name: string;
    dateLocal: string;
    accountTimezone: string;
    currency: string;
    attributionWindow: string;
    actionReportTime: string;
    spendMinor: number;
    impressions: number;
    linkClicks: number;
    purchases: number;
    purchaseValueMinor: number;
    fetchedAt: Date;
  }[];
  klaviyo: {
    kind: string;
    externalId: string;
    name: string;
    periodStart: Date;
    periodEnd: Date;
    conversionMetricId: string;
    recipients: number;
    clicks: number;
    unsubscribes: number;
    conversions: number;
    attributedRevenueMinor: number;
    currency: string;
    fetchedAt: Date;
  }[];
  clarity: {
    windowStart: Date;
    windowEnd: Date;
    dimensions: string[];
    queryHash: string;
    rowCount: number;
    truncated: boolean;
    rows: Record<string, string | number>[];
    fetchedAt: Date;
  }[];
}

const SKUS = [
  { sku: 'DEMO-A', title: 'Demoproduct A', price: 2995 },
  { sku: 'DEMO-B', title: 'Demoproduct B', price: 4950 },
  { sku: 'DEMO-C', title: 'Demoproduct C', price: 1495 },
  { sku: 'DEMO-D', title: 'Demoproduct D', price: 8900 },
  { sku: 'DEMO-E', title: 'Demoproduct E', price: 2200 },
];

/**
 * @param anchorLocal lokale datum 'vandaag' (YYYY-MM-DD) in tz; fixtures bestrijken de 14 dagen ervóór plus vandaag tot 08:00.
 */
export function buildFixtures(anchorLocal: string, tz: string, now: Date): FixtureSet {
  const rnd = prng(20261119);
  const at = (localDate: string, h: number, m: number) => {
    const d = parseLocalDate(localDate);
    return zonedTimeToUtc(d.year, d.month, d.day, h, m, tz);
  };
  const products = SKUS.map((s, i) => ({
    externalId: `gid://demo/Product/${1000 + i}`,
    title: s.title,
    status: 'active',
    variants: [{ externalId: `gid://demo/ProductVariant/${2000 + i}`, sku: s.sku, title: 'Standaard', priceExVatMinor: s.price }],
  }));
  const inventory = SKUS.map((s, i) => ({
    sku: s.sku,
    locationRef: 'demo-magazijn',
    available: [42, 6, 130, 0, 18][i] ?? 0,
    capturedAt: at(anchorLocal, 7, 0),
  }));

  const orders: FixtureSet['orders'] = [];
  const refunds: FixtureSet['refunds'] = [];
  let n = 1001;
  for (let back = 14; back >= 1; back--) {
    const day = addDaysLocal(anchorLocal, -back);
    // Gisteren bewust iets zwakker dan het gemiddelde, zodat de brief een afwijking kan tonen.
    const count = back === 1 ? 7 : 8 + Math.floor(rnd() * 5);
    for (let k = 0; k < count; k++) {
      const lines: FixtureSet['orders'][number]['lines'] = [];
      const nLines = 1 + Math.floor(rnd() * 2);
      for (let li = 0; li < nLines; li++) {
        const s = SKUS[Math.floor(rnd() * SKUS.length)]!;
        const qty = 1 + Math.floor(rnd() * 2);
        const discount = rnd() < 0.25 ? Math.round(s.price * qty * 0.1) : 0;
        lines.push({ externalId: `demo-line-${n}-${li}`, sku: s.sku, quantity: qty, unitPriceExVatMinor: s.price, discountExVatMinor: discount });
      }
      orders.push({
        externalId: `demo-order-${n}`,
        name: `#D${n}`,
        createdAt: at(day, 8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60)),
        cancelledAt: null,
        isTest: false,
        currency: 'EUR',
        shippingExVatMinor: 495,
        taxMinor: 0,
        lines,
      });
      n++;
    }
  }
  const yesterday = addDaysLocal(anchorLocal, -1);
  // Randgevallen gisteren: testorder, geannuleerde order, order in andere valuta, late order vlak voor middernacht.
  orders.push({
    externalId: 'demo-order-test-1', name: '#DTEST1', createdAt: at(yesterday, 10, 0), cancelledAt: null, isTest: true,
    currency: 'EUR', shippingExVatMinor: 0, taxMinor: 0,
    lines: [{ externalId: 'demo-line-test-1', sku: 'DEMO-D', quantity: 5, unitPriceExVatMinor: 8900, discountExVatMinor: 0 }],
  });
  orders.push({
    externalId: 'demo-order-cancel-1', name: '#DCAN1', createdAt: at(yesterday, 11, 0), cancelledAt: at(yesterday, 12, 0), isTest: false,
    currency: 'EUR', shippingExVatMinor: 495, taxMinor: 0,
    lines: [{ externalId: 'demo-line-cancel-1', sku: 'DEMO-B', quantity: 2, unitPriceExVatMinor: 4950, discountExVatMinor: 0 }],
  });
  orders.push({
    externalId: 'demo-order-usd-1', name: '#DUSD1', createdAt: at(yesterday, 15, 0), cancelledAt: null, isTest: false,
    currency: 'USD', shippingExVatMinor: 0, taxMinor: 0,
    lines: [{ externalId: 'demo-line-usd-1', sku: 'DEMO-A', quantity: 1, unitPriceExVatMinor: 3200, discountExVatMinor: 0 }],
  });
  orders.push({
    externalId: 'demo-order-late-1', name: '#DLATE1', createdAt: at(yesterday, 23, 55), cancelledAt: null, isTest: false,
    currency: 'EUR', shippingExVatMinor: 495, taxMinor: 0,
    lines: [{ externalId: 'demo-line-late-1', sku: 'DEMO-C', quantity: 2, unitPriceExVatMinor: 1495, discountExVatMinor: 299 }],
  });
  // Deelrefund gisteren op een order van 3 dagen eerder (retourdatum telt).
  const older = orders.find((o) => o.createdAt < at(addDaysLocal(anchorLocal, -3), 23, 0) && o.createdAt >= at(addDaysLocal(anchorLocal, -4), 0, 0) && !o.isTest);
  if (older && older.lines[0]) {
    const l = older.lines[0];
    refunds.push({ orderExternalId: older.externalId, externalId: 'demo-refund-1', sku: l.sku, quantity: 1, amountExVatMinor: l.unitPriceExVatMinor, refundedAt: at(yesterday, 14, 30) });
  }

  const costs = [
    { sku: 'DEMO-A', kind: 'cogs', amountMinor: 1100, currency: 'EUR', validFrom: at(addDaysLocal(anchorLocal, -60), 0, 0) },
    { sku: 'DEMO-B', kind: 'cogs', amountMinor: 1900, currency: 'EUR', validFrom: at(addDaysLocal(anchorLocal, -60), 0, 0) },
    // DEMO-C/D/E: kostprijs ontbreekt bewust → marge onbekend.
  ];

  const adInsights: FixtureSet['adInsights'] = [];
  for (let back = 14; back >= 1; back--) {
    const day = addDaysLocal(anchorLocal, -back);
    const spend = back === 1 ? 21500 : 14000 + Math.floor(rnd() * 4000);
    const purchases = back === 1 ? 4 : 5 + Math.floor(rnd() * 4);
    adInsights.push({
      accountRef: 'act_demo_0001',
      level: 'account',
      externalId: 'act_demo_0001',
      name: 'Demo-advertentieaccount',
      dateLocal: day,
      accountTimezone: tz,
      currency: 'EUR',
      attributionWindow: '7d_click_1d_view',
      actionReportTime: 'impression',
      spendMinor: spend,
      impressions: 18000 + Math.floor(rnd() * 6000),
      linkClicks: 300 + Math.floor(rnd() * 120),
      purchases,
      purchaseValueMinor: purchases * 4800,
      fetchedAt: at(anchorLocal, 6, 0),
    });
  }

  const klaviyo: FixtureSet['klaviyo'] = [
    {
      kind: 'flow', externalId: 'demo-flow-welcome', name: 'Demo welkomstflow',
      periodStart: at(yesterday, 0, 0), periodEnd: at(anchorLocal, 0, 0), conversionMetricId: 'DEMO_METRIC_ID',
      recipients: 140, clicks: 22, unsubscribes: 1, conversions: 2, attributedRevenueMinor: 8900, currency: 'EUR', fetchedAt: at(anchorLocal, 6, 30),
    },
    {
      kind: 'campaign', externalId: 'demo-campaign-1', name: 'Demo nieuwsbrief',
      periodStart: at(yesterday, 0, 0), periodEnd: at(anchorLocal, 0, 0), conversionMetricId: 'DEMO_METRIC_ID',
      recipients: 2100, clicks: 64, unsubscribes: 5, conversions: 3, attributedRevenueMinor: 11250, currency: 'EUR', fetchedAt: at(anchorLocal, 6, 30),
    },
  ];

  const clarity: FixtureSet['clarity'] = [
    {
      windowStart: at(addDaysLocal(anchorLocal, -2), 7, 0), windowEnd: at(yesterday, 7, 0), dimensions: ['URL', 'Device'],
      queryHash: 'demo-url-device', rowCount: 3, truncated: false, fetchedAt: at(yesterday, 7, 0),
      rows: [
        { URL: '/products/demo-a', Device: 'Mobile', sessions: 410, deadClicks: 38, rageClicks: 12, scrollDepthAvg: 41 },
        { URL: '/products/demo-a', Device: 'Desktop', sessions: 160, deadClicks: 6, rageClicks: 1, scrollDepthAvg: 63 },
        { URL: '/cart', Device: 'Mobile', sessions: 120, deadClicks: 9, rageClicks: 4, scrollDepthAvg: 55 },
      ],
    },
    {
      windowStart: at(yesterday, 7, 0), windowEnd: at(anchorLocal, 7, 0), dimensions: ['URL', 'Device'],
      queryHash: 'demo-url-device', rowCount: 3, truncated: false, fetchedAt: at(anchorLocal, 7, 0),
      rows: [
        { URL: '/products/demo-a', Device: 'Mobile', sessions: 445, deadClicks: 52, rageClicks: 19, scrollDepthAvg: 38 },
        { URL: '/products/demo-a', Device: 'Desktop', sessions: 150, deadClicks: 5, rageClicks: 1, scrollDepthAvg: 64 },
        { URL: '/cart', Device: 'Mobile', sessions: 118, deadClicks: 8, rageClicks: 3, scrollDepthAvg: 57 },
      ],
    },
  ];

  void now;
  return { products, inventory, orders, refunds, costs, adInsights, klaviyo, clarity };
}
