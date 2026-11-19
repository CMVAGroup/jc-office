import { ConnectorError } from '../index';
import { CMVA_SOURCE_VERSION, type CmvaSummary } from './schema';

/** Decimal wire amounts become integers without binary floating point multiplication. */
export function cmvaMinor(value: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new ConnectorError('schema_change', 'CMVA bedrag of ratio heeft onverwachte precisie.');
  return (match[1] ? -1n : 1n) * (BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0')));
}

/** Latest valid occurrence on/before generation day in the shop timezone.
 * The upstream document has no year: older history cannot be disambiguated.
 */
export function cmvaDate(day: string, generatedAt: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(generatedAt));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const anchor = `${get('year')}-${get('month')}-${get('day')}`;
  const [dd, mm] = day.split('-');
  if (!/^\d{2}-\d{2}$/.test(day)) throw new ConnectorError('schema_change', 'CMVA dagdatum is ongeldig.');
  // At most current/prior year; never silently turn stale leap days into four-year-old data.
  for (const year of [Number(get('year')), Number(get('year')) - 1]) {
    const full = `${year}-${mm}-${dd}`;
    const date = new Date(`${full}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === full && full <= anchor)
      return full;
  }
  throw new ConnectorError('schema_change', 'CMVA dagdatum kan niet veilig worden aangevuld met een jaar.');
}

export function normalizeCmva(summary: CmvaSummary, profile: string) {
  if (summary.stores.length !== 1 || summary.stores[0]?.store !== profile)
    throw new ConnectorError('schema_change', 'CMVA winkelprofiel wijkt af.');
  const seen = new Set<string>();
  return summary.stores[0].per_day.flatMap((day) => {
    const dateLocal = cmvaDate(day.date, summary.generated_at);
    if (seen.has(dateLocal)) throw new ConnectorError('schema_change', 'CMVA bevat dubbele dagdatums.');
    seen.add(dateLocal);
    return Object.entries(day)
      .filter(([key]) => key !== 'date')
      .map(([metric, value]) => ({
        storeProfile: profile,
        dateLocal,
        metric,
        valueMinor:
          value === null ? null : metric === 'orders' ? BigInt(value as number) : cmvaMinor(value as number),
        unit: metric === 'orders' ? 'count' : metric === 'roas' ? 'ratio_hundredths' : 'minor',
        sourceCurrency: 'EUR',
        sourceTimezone: 'Australia/Sydney',
        sourceVersion: CMVA_SOURCE_VERSION,
        generatedAt: new Date(summary.generated_at),
        dateAssumption: 'latest_occurrence_on_or_before_generated_at',
      }));
  });
}
