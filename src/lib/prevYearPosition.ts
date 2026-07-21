import { unstable_cache } from 'next/cache';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, PREV_YEAR_FIELDS } from '@/lib/airtable/schema';
import { durationToHHMM } from '@/lib/schedule/time';
import type { ShiftData } from '@/lib/formTypes';

export interface PrevYearPosition {
  recordId: string;
  week: Record<string, ShiftData[]>;
  subRole: string;
  notes: string;
  hoursForBudget: number | null;
  frontalHours: number | null;
  individualHours: number | null;
  stayHours: number | null;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

function allFields(): string[] {
  const ids: string[] = [
    PREV_YEAR_FIELDS.tz,
    PREV_YEAR_FIELDS.role,
    PREV_YEAR_FIELDS.category,
    PREV_YEAR_FIELDS.mosad,
    PREV_YEAR_FIELDS.layer,
    PREV_YEAR_FIELDS.weeklyHours,
    PREV_YEAR_FIELDS.subRole,
    PREV_YEAR_FIELDS.notes,
    PREV_YEAR_FIELDS.hoursForBudget,
    PREV_YEAR_FIELDS.frontalHours,
    PREV_YEAR_FIELDS.individualHours,
    PREV_YEAR_FIELDS.stayHours,
  ];
  for (const day of DAYS) {
    ids.push(...PREV_YEAR_FIELDS.schedule[day].in);
    ids.push(...PREV_YEAR_FIELDS.schedule[day].out);
  }
  return ids;
}

export function extractWeek(fields: Record<string, unknown>): Record<string, ShiftData[]> {
  const week: Record<string, ShiftData[]> = {};
  for (const day of DAYS) {
    const shifts: ShiftData[] = [];
    const ins = PREV_YEAR_FIELDS.schedule[day].in;
    const outs = PREV_YEAR_FIELDS.schedule[day].out;
    for (let i = 0; i < 3; i++) {
      const inVal = durationToHHMM(fields[ins[i]]);
      const outVal = durationToHHMM(fields[outs[i]]);
      if (inVal && outVal) {
        shifts.push({ in: inVal, out: outVal });
      }
    }
    week[day] = shifts;
  }
  return week;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x && 'name' in x ? (x as { name: string }).name : String(x))).join(', ');
  return String(v);
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Fetch the prior-year rows for ONE employee (filtered in Airtable by ת.ז.), cached per
 * tz for 30 minutes (table is read-only). ת.ז. is highly selective, so this returns a
 * handful of rows instead of scanning all ~3785 rows across ~38 pages (~55s cold).
 * Matches the tz both as given and as bare digits (leading zeros vary in source data).
 */
export const fetchPrevYearRowsByTz = unstable_cache(
  async (tz: string) => {
    const digits = tz.replace(/\D/g, '');
    // ת.ז. is 9 digits; the source data stores it both padded and unpadded.
    const variants = Array.from(new Set([tz, digits, digits.padStart(9, '0')].filter(Boolean)));
    const filterByFormula = variants.length
      ? `OR(${variants.map((v) => `{${PREV_YEAR_FIELDS.tz}}="${escapeFormulaValue(v)}"`).join(',')})`
      : undefined;
    return listRecords(TABLES.prevYearPositions, { filterByFormula, fields: allFields() });
  },
  // v2: added שכבה + שעות שבועיות to the fetched fields (getPreviousYearHours).
  ['prev-year-positions-by-tz-v2'],
  { revalidate: 1800 },
);

/**
 * Look up a prior-year (תשפ"ו) position for the same employee + role + category + institution.
 * Returns the schedule (week), subRole, and notes if found; null otherwise.
 */
export async function getPrevYearPosition(
  tz: string,
  roleTitle: string,
  category: string,
  mosadName: string,
  requestId?: string,
): Promise<PrevYearPosition | null> {
  const rows = await fetchPrevYearRowsByTz(tz);

  const tzDigits = tz.replace(/\D/g, '');
  const normRole = normalize(roleTitle);
  const normCategory = normalize(category);
  const normMosad = normalize(mosadName);

  for (const row of rows) {
    const f = row.fields;
    // Match tz robustly: source data and form may differ on leading zeros.
    const rowTzDigits = str(f[PREV_YEAR_FIELDS.tz]).replace(/\D/g, '');
    if (rowTzDigits !== tzDigits) continue;
    if (normalize(str(f[PREV_YEAR_FIELDS.role])) !== normRole) continue;
    if (normalize(str(f[PREV_YEAR_FIELDS.category])) !== normCategory) continue;
    if (normalize(str(f[PREV_YEAR_FIELDS.mosad])) !== normMosad) continue;

    function numOrNull(v: unknown): number | null {
      const n = Number(v);
      return v != null && v !== '' && !isNaN(n) ? n : null;
    }
    return {
      recordId: row.id,
      week: extractWeek(f),
      subRole: str(f[PREV_YEAR_FIELDS.subRole]),
      notes: str(f[PREV_YEAR_FIELDS.notes]),
      hoursForBudget: numOrNull(f[PREV_YEAR_FIELDS.hoursForBudget]),
      frontalHours: numOrNull(f[PREV_YEAR_FIELDS.frontalHours]),
      individualHours: numOrNull(f[PREV_YEAR_FIELDS.individualHours]),
      stayHours: numOrNull(f[PREV_YEAR_FIELDS.stayHours]),
    };
  }

  return null;
}
