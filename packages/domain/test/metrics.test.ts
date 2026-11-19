import { describe, expect, it } from 'vitest';
import {
  averageOrderValue,
  contributionMargin,
  conversionRate,
  divideMinorRound,
  metaSpend,
  netProductRevenue,
  orderCount,
  periodFromLocalDates,
  revenuePerMetaSpend,
  zonedTimeToUtc,
  type MetricInputs,
} from '../src';

const tz = 'Europe/Amsterdam';
const at = (d: number, h: number, m = 0, month = 11) => zonedTimeToUtc(2026, month, d, h, m, tz);

function inputs(over: Partial<MetricInputs> = {}): MetricInputs {
  return {
    period: periodFromLocalDates('2026-11-18', '2026-11-18', tz),
    shopCurrency: 'EUR',
    orders: [
      { id: 'o1', createdAt: at(18, 10), cancelledAt: null, isTest: false, currency: 'EUR', lines: [{ id: 'l1', sku: 'A', quantity: 2, unitPriceExVatMinor: 1000, discountExVatMinor: 200 }] },
      { id: 'o2', createdAt: at(18, 23, 59), cancelledAt: null, isTest: false, currency: 'EUR', lines: [{ id: 'l2', sku: 'B', quantity: 1, unitPriceExVatMinor: 3000, discountExVatMinor: 0 }] },
      { id: 'test', createdAt: at(18, 11), cancelledAt: null, isTest: true, currency: 'EUR', lines: [{ id: 'l3', sku: 'A', quantity: 9, unitPriceExVatMinor: 1000, discountExVatMinor: 0 }] },
      { id: 'cancel', createdAt: at(18, 12), cancelledAt: at(18, 13), isTest: false, currency: 'EUR', lines: [{ id: 'l4', sku: 'A', quantity: 1, unitPriceExVatMinor: 1000, discountExVatMinor: 0 }] },
      { id: 'usd', createdAt: at(18, 14), cancelledAt: null, isTest: false, currency: 'USD', lines: [{ id: 'l5', sku: 'A', quantity: 1, unitPriceExVatMinor: 1000, discountExVatMinor: 0 }] },
      { id: 'nextday', createdAt: at(19, 0, 1), cancelledAt: null, isTest: false, currency: 'EUR', lines: [{ id: 'l6', sku: 'A', quantity: 1, unitPriceExVatMinor: 1000, discountExVatMinor: 0 }] },
      { id: 'old', createdAt: at(15, 10), cancelledAt: null, isTest: false, currency: 'EUR', lines: [{ id: 'l7', sku: 'A', quantity: 1, unitPriceExVatMinor: 1000, discountExVatMinor: 0 }] },
    ],
    refundLines: [
      { id: 'r1', orderId: 'old', sku: 'A', amountExVatMinor: 500, refundedAt: at(18, 9) }, // deelrefund op oudere order
      { id: 'r2', orderId: 'test', sku: 'A', amountExVatMinor: 9000, refundedAt: at(18, 15) }, // testorder: negeren
    ],
    adInsights: [
      { id: 'm1', dateLocal: '2026-11-18', accountTimezone: tz, currency: 'EUR', level: 'account', spendMinor: 1500, purchaseValueMinor: 4000, attributionWindow: '7d_click_1d_view' },
    ],
    costs: [{ sku: 'A', kind: 'cogs' }],
    klaviyo: [],
    validatedSessionSource: false,
    ...over,
  };
}

describe('netto productomzet', () => {
  it('trekt korting en deelrefund (op retourdatum) af; sluit test, geannuleerd, andere valuta en volgende dag uit', () => {
    const r = netProductRevenue(inputs());
    // (2×1000 − 200) + 3000 − 500 (refund) = 4300
    expect(r.value).toBe(4300);
    expect(r.filters).toMatchObject({ grossMinor: 5000, discountsMinor: 200, refundsMinor: 500 });
    expect(r.sourceRecordIds).toEqual(['o1', 'o2', 'r1']);
    expect(r.notes.join(' ')).toMatch(/testorder.*geannuleerd.*USD/s);
  });

  it('respecteert de daggrens in de rapportagezone', () => {
    expect(orderCount(inputs()).value).toBe(2);
  });

  it('werkt met zomertijdovergang (25-uursdag) zonder orders te verliezen', () => {
    const p = periodFromLocalDates('2026-10-25', '2026-10-25', tz);
    expect((p.endUtc.getTime() - p.startUtc.getTime()) / 3600e3).toBe(25);
    const r = orderCount(inputs({
      period: p,
      orders: [
        { id: 'a', createdAt: zonedTimeToUtc(2026, 10, 25, 0, 30, tz), cancelledAt: null, isTest: false, currency: 'EUR', lines: [] },
        { id: 'b', createdAt: zonedTimeToUtc(2026, 10, 25, 23, 30, tz), cancelledAt: null, isTest: false, currency: 'EUR', lines: [] },
      ],
    }));
    expect(r.value).toBe(2);
  });

  it('nul orders: omzet 0, AOV onbekend (geen deling door nul)', () => {
    const i = inputs({ orders: [], refundLines: [] });
    expect(netProductRevenue(i).value).toBe(0);
    const aov = averageOrderValue(i);
    expect(aov.status).toBe('unknown');
    expect(aov.value).toBeNull();
  });
});

describe('AOV en ratio’s', () => {
  it('AOV = netto productomzet / dezelfde orderpopulatie, half-up afgerond', () => {
    const r = averageOrderValue(inputs());
    expect(r.numerator).toBe(4300);
    expect(r.denominator).toBe(2);
    expect(r.value).toBe(2150);
  });
  it('omzet/Meta-spend heet expliciet zo en noemt de beperking', () => {
    const r = revenuePerMetaSpend(inputs());
    expect(r.value).toBe(2.87);
    expect(r.label).toBe('Omzet / Meta-spend');
    expect(r.notes.join(' ')).toMatch(/Alleen Meta-spend/);
  });
  it('markeert afwijkende Meta-accounttijdzone als gedeeltelijk', () => {
    const r = metaSpend(inputs({ adInsights: [{ id: 'm', dateLocal: '2026-11-18', accountTimezone: 'America/New_York', currency: 'EUR', level: 'account', spendMinor: 100, purchaseValueMinor: 0, attributionWindow: 'x' }] }));
    expect(r.status).toBe('partial');
    expect(r.notes[0]).toMatch(/tijdzone/);
  });
  it('geen Meta-data: spend en ratio onbekend', () => {
    expect(metaSpend(inputs({ adInsights: [] })).value).toBeNull();
    expect(revenuePerMetaSpend(inputs({ adInsights: [] })).status).toBe('unknown');
  });
});

describe('onbekend blijft onbekend', () => {
  it('marge onbekend bij ontbrekende kostprijs; noemt de SKU', () => {
    const r = contributionMargin(inputs());
    expect(r.value).toBeNull();
    expect(r.notes.join(' ')).toMatch(/B/);
  });
  it('conversie onbekend zonder gevalideerde sessiebron; Clarity is geen vervanging', () => {
    const r = conversionRate(inputs());
    expect(r.status).toBe('unknown');
    expect(r.notes[0]).toMatch(/Clarity/);
  });
});

describe('geld', () => {
  it('deelt half-up in minor units en weigert floats', () => {
    expect(divideMinorRound(5, 2)).toBe(3);
    expect(divideMinorRound(-5, 2)).toBe(-3);
    expect(divideMinorRound(4, 3)).toBe(1);
    expect(() => divideMinorRound(1.5, 2)).toThrow();
  });
});
