import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, OFEK_FIELDS } from '@/lib/airtable/schema';

/** Result row from מחשבון אופק חדש. */
export interface OfekResult {
  recordId: string;
  frontalHours: number;
  individualHours: number;
  stayHours: number;
  totalHours: number;
  jobPercent: number;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Look up a single ofek-calculator record by its exact key (סיכום). Returns null if not found. */
export async function lookupOfek(key: string, requestId?: string): Promise<OfekResult | null> {
  const safe = escapeFormulaValue(key);
  const formula = `{${OFEK_FIELDS.key}}="${safe}"`;
  const records = await listRecords(TABLES.ofekCalc, { filterByFormula: formula, maxRecords: 1 }, requestId);
  const r = records[0];
  if (!r) return null;
  return {
    recordId: r.id,
    frontalHours: num(r.fields[OFEK_FIELDS.frontalHours]),
    individualHours: num(r.fields[OFEK_FIELDS.individualHours]),
    stayHours: num(r.fields[OFEK_FIELDS.stayHours]),
    totalHours: num(r.fields[OFEK_FIELDS.totalHours]),
    jobPercent: num(r.fields[OFEK_FIELDS.jobPercent]),
  };
}
