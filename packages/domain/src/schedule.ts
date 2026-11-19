// Duurzame planning: berekent welke geplande firing nu aan de beurt is.
// Uniciteit (schedule_id, planned_at) in de database voorkomt dubbele starts, ook na herstart of met meerdere workers.
import { addDaysLocal, localDateString, localParts, parseLocalDate, zonedTimeToUtc } from './time';

export interface ScheduleSpec {
  timeOfDay: string; // HH:MM
  weekdays: number[]; // 1=ma … 7=zo
  timezone: string;
  graceMinutes: number;
  maxCatchUpMinutes: number;
  enabled: boolean;
}

export interface DueFiring {
  plannedAt: Date;
  late: boolean;
}

export const DEFAULT_MEETING_SCHEDULES = [
  { key: 'meeting_standup', kind: 'meeting', label: 'Dagstart', timeOfDay: '09:00' },
  { key: 'meeting_progress', kind: 'meeting', label: 'Voortgang', timeOfDay: '13:00' },
  { key: 'meeting_close', kind: 'meeting', label: 'Dagafsluiting', timeOfDay: '16:30' },
] as const;

export const MEETING_KIND_BY_KEY: Record<string, 'standup' | 'progress' | 'close'> = {
  meeting_standup: 'standup',
  meeting_progress: 'progress',
  meeting_close: 'close',
};

function parseHm(s: string): { h: number; m: number } {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Ongeldige tijd ${s}`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Ongeldige tijd ${s}`);
  return { h, m: mi };
}

/** Geplande instants voor een lokale datum (leeg als de weekdag niet ingepland is). */
export function plannedInstantFor(spec: ScheduleSpec, localDate: string): Date | null {
  const { year, month, day } = parseLocalDate(localDate);
  const weekday = ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
  if (!spec.weekdays.includes(weekday)) return null;
  const { h, m } = parseHm(spec.timeOfDay);
  return zonedTimeToUtc(year, month, day, h, m, spec.timezone);
}

/**
 * Laatste geplande instant ≤ now die nog niet gevuurd is (lastPlannedAt), mits binnen maxCatchUp.
 * Speelt nooit een stapel oude firings af: alleen de meest recente telt.
 */
export function computeDueFiring(spec: ScheduleSpec, now: Date, lastPlannedAt: Date | null): DueFiring | null {
  if (!spec.enabled) return null;
  const today = localDateString(now, spec.timezone);
  let latest: Date | null = null;
  for (let i = 0; i < 8 && !latest; i++) {
    const t = plannedInstantFor(spec, addDaysLocal(today, -i));
    if (t && t.getTime() <= now.getTime()) latest = t;
  }
  if (!latest) return null;
  if (lastPlannedAt && lastPlannedAt.getTime() >= latest.getTime()) return null;
  const ageMin = (now.getTime() - latest.getTime()) / 60000;
  if (ageMin > spec.maxCatchUpMinutes) return null;
  return { plannedAt: latest, late: ageMin > spec.graceMinutes };
}

/** Volgende geplande instant > now (voor weergave). */
export function nextPlanned(spec: ScheduleSpec, now: Date): Date | null {
  if (!spec.enabled) return null;
  const today = localDateString(now, spec.timezone);
  for (let i = 0; i < 9; i++) {
    const t = plannedInstantFor(spec, addDaysLocal(today, i));
    if (t && t.getTime() > now.getTime()) return t;
  }
  return null;
}

export function isWorkingHours(now: Date, tz: string, startHour = 8, endHour = 18): boolean {
  const p = localParts(now, tz);
  return p.weekday <= 5 && p.hour >= startHour && p.hour < endHour;
}
