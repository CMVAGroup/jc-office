// Tijdzonehulpen zonder externe bibliotheken. Opslag in UTC, presentatie in rapportagezone.

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 1=maandag ... 7=zondag (ISO)
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(date: Date, tz: string): LocalParts {
  const parts = Object.fromEntries(dtf(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
  };
}

/** Offset van tz t.o.v. UTC in minuten op het gegeven instant (bijv. +60 voor CET). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Zet een lokale wandkloktijd in tz om naar een UTC-instant. Bij een niet-bestaande tijd (zomertijdsprong) schuift hij naar voren. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

export function localDateString(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseLocalDate(s: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Ongeldige datum: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function addDaysLocal(s: string, days: number): string {
  const { year, month, day } = parseLocalDate(s);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export interface Period {
  /** Inclusieve lokale startdatum */
  fromLocal: string;
  /** Inclusieve lokale einddatum */
  toLocal: string;
  timezone: string;
  /** Halfopen UTC-interval [startUtc, endUtc) */
  startUtc: Date;
  endUtc: Date;
}

export function periodFromLocalDates(fromLocal: string, toLocal: string, tz: string): Period {
  const a = parseLocalDate(fromLocal);
  const b = parseLocalDate(addDaysLocal(toLocal, 1));
  return {
    fromLocal,
    toLocal,
    timezone: tz,
    startUtc: zonedTimeToUtc(a.year, a.month, a.day, 0, 0, tz),
    endUtc: zonedTimeToUtc(b.year, b.month, b.day, 0, 0, tz),
  };
}

export function localDatesInPeriod(p: Period): string[] {
  const out: string[] = [];
  for (let d = p.fromLocal; d <= p.toLocal; d = addDaysLocal(d, 1)) out.push(d);
  return out;
}
