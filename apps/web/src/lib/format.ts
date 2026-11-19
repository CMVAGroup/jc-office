import { formatMinor } from '@jc/domain';

export function fmtMetric(value: number | null, unit: string, currency: string | null): string {
  if (value === null || value === undefined) return 'onbekend';
  if (unit === 'minor') return formatMinor(value, currency);
  if (unit === 'ratio') return value.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
  return value.toLocaleString('nl-NL');
}

export function fmtTime(d: Date | string | null | undefined, tz = 'Europe/Amsterdam'): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('nl-NL', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' });
}
