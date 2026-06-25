import { listRecords, escapeFormulaValue, type AirtableRecord } from '@/lib/airtable/client';
import { TABLES, BELL_FIELDS } from '@/lib/airtable/schema';
import { durationToHHMM, toMinutes } from './time';

/**
 * Bell-schedule (לוח צלצולים) slots for teaching staff.
 *
 * Each role (תקציב התחלתי) carries a "לוח צלצולים" value (e.g. "1"), which matches
 * the `סוג` field on bell-schedule rows. Picking a role → show only the rows whose
 * סוג is in the role's bellScheduleNums. The picked row's `שעות יומיות` is the value
 * that counts; its כניסה/יציאה fill the day's entry/exit for display + write-back.
 *
 * Live data is messy: ~200+ rows per סוג accumulated over years, with duplicate time
 * ranges and a few corrupt rows (exit ≤ entry, missing hours). We dedupe by time range
 * and drop invalid rows so the picker shows a clean, distinct list.
 */

/** Which days a slot applies to: "א-ה" (Sun–Thu) or "ו" (Fri). */
export type WeekdayGroup = 'weekdays' | 'friday' | 'unknown';

/** A selectable bell-schedule slot, shaped for the UI. */
export interface BellSlot {
  id: string;
  type: string; // סוג
  /** "HH:MM" entry time. */
  in: string;
  /** "HH:MM" exit time. */
  out: string;
  /** שעות יומיות — already computed in Airtable. */
  dailyHours: number;
  /** Day group this slot belongs to. */
  weekday: WeekdayGroup;
  /** מורת צהריים — slot starts before 12:00 and is restricted to afternoon teachers.
   *  Allowed only on the one morning day the user designates. */
  afternoonOnly: boolean;
}

function single(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.length ? single(v[0]) : null;
  return String(v);
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function weekdayGroup(v: unknown): WeekdayGroup {
  const name = single(v);
  if (name === 'א-ה') return 'weekdays';
  if (name === 'ו') return 'friday';
  return 'unknown';
}

function mapSlot(r: AirtableRecord): BellSlot {
  const f = r.fields;
  return {
    id: r.id,
    type: single(f[BELL_FIELDS.type]) ?? '',
    in: durationToHHMM(f[BELL_FIELDS.entry]),
    out: durationToHHMM(f[BELL_FIELDS.exit]),
    dailyHours: num(f[BELL_FIELDS.dailyHours]),
    weekday: weekdayGroup(f[BELL_FIELDS.weekday]),
    afternoonOnly: f[BELL_FIELDS.afternoonTeacher] === true,
  };
}

/** A row is usable only if it has a valid forward time range and positive daily hours. */
function isValidSlot(s: BellSlot): boolean {
  const a = toMinutes(s.in);
  const b = toMinutes(s.out);
  if (a == null || b == null || b <= a) return false; // missing/negative range (corrupt data)
  if (s.dailyHours <= 0) return false; // no hours to count
  return true;
}

/**
 * Slots available for a role, given its bell-schedule numbers (role.bellScheduleNums).
 * Filtered to rows whose סוג ∈ types, validated, and deduped by type+range+weekday.
 * Returns [] when the role has no bell schedule. Sorted by weekday group then entry time.
 */
export async function getBellSlots(types: string[], requestId?: string): Promise<BellSlot[]> {
  const wanted = new Set(types.filter(Boolean));
  if (wanted.size === 0) return [];

  // The bell-schedule table is large (~1500 rows). Filter by סוג in Airtable so only the
  // few hundred matching rows come back (e.g. סוג="1" → ~214 rows / 3 pages vs 1484 / 15).
  // A redundant in-memory `wanted` check below guards correctness. סוג is a singleSelect;
  // matching its choice name in a formula is reliable.
  const typeFilter = `OR(${Array.from(wanted)
    .map((t) => `{${BELL_FIELDS.type}}="${escapeFormulaValue(t)}"`)
    .join(',')})`;
  const rows = await listRecords(
    TABLES.bellSchedule,
    {
      filterByFormula: typeFilter,
      fields: [
        BELL_FIELDS.type,
        BELL_FIELDS.entry,
        BELL_FIELDS.exit,
        BELL_FIELDS.dailyHours,
        BELL_FIELDS.weekday,
        BELL_FIELDS.afternoonTeacher,
      ],
    },
    requestId,
  );

  const seen = new Set<string>();
  const slots: BellSlot[] = [];
  for (const r of rows) {
    const s = mapSlot(r);
    if (!wanted.has(s.type) || !isValidSlot(s)) continue;
    // Dedupe identical bands within the same type/day-group (keep the first valid id).
    const key = `${s.type}|${s.weekday}|${s.in}-${s.out}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push(s);
  }

  const groupOrder: Record<WeekdayGroup, number> = { weekdays: 0, friday: 1, unknown: 2 };
  return slots.sort(
    (a, b) => groupOrder[a.weekday] - groupOrder[b.weekday] || a.in.localeCompare(b.in),
  );
}
