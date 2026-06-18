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

export interface ExistingHoursSum {
  count: number;
  frontalHours: number;
  individualHours: number;
  stayHours: number; // all stay types combined (institution + home + para-ganim)
}

/**
 * Sum the hour breakdown of the employee's EXISTING active positions
 * in the same category + layer (7ו). Excludes none — these are prior roles
 * whose hours must be combined for the ofek re-check.
 * Pass excludePositionId when editing an existing position so its old hours
 * are not double-counted alongside the newly entered hours.
 */
export async function sumExistingPositions(
  params: { tz: string; category: string; layer: string; excludePositionId?: string },
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
    const cat = text(r.fields[POSITION_FIELDS.category]);
    const layer = text(r.fields[POSITION_FIELDS.layer]);
    return cat.includes(params.category) && (params.layer === '' || layer.includes(params.layer));
  });

  let frontal = 0,
    individual = 0,
    stay = 0;
  for (const r of matched) {
    frontal += num(r.fields[POSITION_FIELDS.frontalHours]);
    individual += num(r.fields[POSITION_FIELDS.individualHours]);
    stay +=
      num(r.fields[POSITION_FIELDS.stayHours]) +
      num(r.fields[POSITION_FIELDS.stayHoursHome]) +
      num(r.fields[POSITION_FIELDS.stayHoursHomeParaGanim]);
  }

  return { count: matched.length, frontalHours: frontal, individualHours: individual, stayHours: stay };
}
