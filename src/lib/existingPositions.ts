import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS } from '@/lib/airtable/schema';

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.reduce<number>((a, x) => a + num(x), 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(',');
  return String(v);
}

export interface HoursTotals {
  count: number;
  frontalHours: number;
  individualHours: number;
  stayHours: number; // all stay types combined (institution + home + para-ganim)
}

export interface ExistingHoursSum extends HoursTotals {
  /**
   * The same totals narrowed to ONE institution — used by the conditions-worsening
   * check, which compares against a previous year scoped to קטגוריה + מוסד + שכבה.
   * Empty totals when no mosadId is passed.
   */
  sameInstitution: HoursTotals;
}

/**
 * Sum the hour breakdown of the employee's EXISTING active positions
 * in the same category + layer (7ו). Excludes none — these are prior roles
 * whose hours must be combined for the ofek re-check, which spans ALL institutions.
 * Pass excludePositionId when editing an existing position so its old hours
 * are not double-counted alongside the newly entered hours.
 * Pass mosadId (a מוסדות record ID) to also get the same-institution subtotal.
 */
export async function sumExistingPositions(
  params: { tz: string; category: string; layer: string; mosadId?: string; excludePositionId?: string },
  requestId?: string,
): Promise<ExistingHoursSum> {
  const tz = escapeFormulaValue(params.tz);
  // Match by ת.ז. (lookup) — narrow category + layer in memory.
  const formula = `FIND("${tz}", {${POSITION_FIELDS.tzLookup}})`;
  const records = await listRecords(
    TABLES.activePositions,
    { filterByFormula: formula, maxRecords: 50 },
    requestId,
  );

  const matched = records.filter((r) => {
    if (params.excludePositionId && r.id === params.excludePositionId) return false;
    // תפקיד שנה קודמת (prevYearStatus = "כן") לא נספר כתפקיד נוסף
    if (text(r.fields[POSITION_FIELDS.prevYearStatus]) === 'כן') return false;
    const cat = text(r.fields[POSITION_FIELDS.category]);
    const layer = text(r.fields[POSITION_FIELDS.layer]);
    return cat.includes(params.category) && (params.layer === '' || layer.includes(params.layer));
  });

  const all = emptyTotals();
  const sameInstitution = emptyTotals();
  for (const r of matched) {
    const frontal = num(r.fields[POSITION_FIELDS.frontalHours]);
    const individual = num(r.fields[POSITION_FIELDS.individualHours]);
    const stay =
      num(r.fields[POSITION_FIELDS.stayHours]) +
      num(r.fields[POSITION_FIELDS.stayHoursHome]) +
      num(r.fields[POSITION_FIELDS.stayHoursHomeParaGanim]);

    add(all, frontal, individual, stay);
    // The מוסד lookup carries מוסדות record IDs — exact match, no name juggling.
    if (params.mosadId && recordIds(r.fields[POSITION_FIELDS.mosadLookup]).includes(params.mosadId)) {
      add(sameInstitution, frontal, individual, stay);
    }
  }

  return { ...all, sameInstitution };
}

function emptyTotals(): HoursTotals {
  return { count: 0, frontalHours: 0, individualHours: 0, stayHours: 0 };
}

function add(t: HoursTotals, frontal: number, individual: number, stay: number): void {
  t.count += 1;
  t.frontalHours += frontal;
  t.individualHours += individual;
  t.stayHours += stay;
}

function recordIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as any)?.id)).filter(Boolean);
}
