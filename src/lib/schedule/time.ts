/** Time / duration helpers for weekly schedule entry. Pure, unit-tested. */

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type Day = (typeof DAYS)[number];

export const DAY_LABELS: Record<Day, string> = {
  sun: 'ראשון',
  mon: 'שני',
  tue: 'שלישי',
  wed: 'רביעי',
  thu: 'חמישי',
  fri: 'שישי',
};

/** A single shift: "HH:MM" entry/exit strings (empty allowed = unfilled). */
export interface Shift {
  in: string;
  out: string;
}

/** Parse "HH:MM" → minutes since midnight, or null if blank/invalid. */
export function toMinutes(hhmm: string): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Duration of a shift in minutes (out - in), or 0 if incomplete/invalid. */
export function shiftMinutes(s: Shift): number {
  const a = toMinutes(s.in);
  const b = toMinutes(s.out);
  if (a == null || b == null) return 0;
  return Math.max(0, b - a);
}

export interface DayValidation {
  ok: boolean;
  error?: string;
}

/**
 * Validate a day's shifts:
 *  - each shift: out > in
 *  - shifts ordered: each next shift starts at/after previous ends (no overlap, not earlier)
 */
export function validateDay(shifts: Shift[]): DayValidation {
  let prevEnd = -1;
  for (const s of shifts) {
    const a = toMinutes(s.in);
    const b = toMinutes(s.out);
    if (a == null && b == null) continue; // empty shift skipped
    if (a == null || b == null) return { ok: false, error: 'יש למלא כניסה ויציאה' };
    if (b <= a) return { ok: false, error: 'שעת יציאה מוקדמת משעת הכניסה' };
    if (a < prevEnd) return { ok: false, error: 'משמרת חופפת או מוקדמת מהקודמת' };
    prevEnd = b;
  }
  return { ok: true };
}

/** Total weekly minutes across all days/shifts. */
export function weeklyMinutes(week: Record<Day, Shift[]>): number {
  let total = 0;
  for (const day of DAYS) {
    for (const s of week[day] ?? []) total += shiftMinutes(s);
  }
  return total;
}

export const WEEKLY_CAP_HOURS = 42;

/** Round to nearest whole or half. */
export function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export const PARA_MIN_DAY_MINUTES = 80;

/**
 * Convert a single para day's total minutes to academic hours (שעות אקדמיות).
 * Returns null if the day has no work (0 minutes — skip the day).
 * Returns { error } if minutes < 80 (below the minimum — block the whole form).
 *
 * Rules (per day total minutes):
 *  80 ≤ min < 100 → (min − 35) ÷ 45
 *  min ≥ 100      → (min − 40) ÷ 45
 */
export type ParaDayResult = { ok: true; hours: number } | { ok: false; error: string };

export function paraDayHours(dayMinutes: number): ParaDayResult | null {
  if (dayMinutes === 0) return null;
  if (dayMinutes < PARA_MIN_DAY_MINUTES)
    return { ok: false, error: `${dayMinutes} דקות עבודה — לא ניתן להגיש פחות מ-80 דקות ביום` };
  const deduct = dayMinutes < 100 ? 35 : 40;
  return { ok: true, hours: (dayMinutes - deduct) / 45 };
}

/**
 * Snap `hours` to the nearest whole or half, but only if it falls within `tolerance`.
 * Returns the snapped value, or `null` if the nearest whole/half is farther than `tolerance`.
 *
 * Used before ofek-calc to ensure the key hits a valid entry:
 *  - הוראה (bell schedule): tolerance = 0.3
 *  - פרא: tolerance = 0.01
 */
export function snapToHalf(hours: number, tolerance: number): number | null {
  const snapped = roundToHalf(hours);
  return Math.abs(snapped - hours) <= tolerance ? snapped : null;
}

/** Airtable duration = seconds from midnight → "HH:MM". Returns '' for null/blank/invalid. */
export function durationToHHMM(v: unknown): string {
  if (v == null || v === '') return '';
  const secs = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(secs) || secs < 0) return '';
  const totalMin = Math.round(secs / 60);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
