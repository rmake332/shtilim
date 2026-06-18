import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, HOURS_SUMMARY_FIELDS } from '@/lib/airtable/schema';

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.map(text).join('');
  return String(v);
}

/**
 * Previous-year hours for an employee, matched by ת.ז. + category + institution
 * from סיכום שעות לעובד. Returns null if no prior record.
 */
export async function getPreviousYearHours(
  params: { tz: string; category: string; institution: string },
  requestId?: string,
): Promise<number | null> {
  const tz = escapeFormulaValue(params.tz);
  // ת.ז. in סיכום שעות לעובד may be a lookup (array). ARRAYJOIN flattens it before FIND.
  const formula = `FIND("${tz}", ARRAYJOIN({${HOURS_SUMMARY_FIELDS.tz}}, ","))`;
  const records = await listRecords(TABLES.hoursSummary, { filterByFormula: formula, maxRecords: 20 }, requestId);

  // Narrow by category + institution in memory (those are plain text in this table).
  const match = records.find((r) => {
    const cat = text(r.fields[HOURS_SUMMARY_FIELDS.category]);
    const inst = text(r.fields[HOURS_SUMMARY_FIELDS.institution]);
    // institution in the summary table may be a short name ("בדיקות") while
    // the form sends the full symbolLabel ("999999 — בדיקות"); match either direction.
    return (
      (cat.includes(params.category) || params.category.includes(cat)) &&
      (inst.includes(params.institution) || params.institution.includes(inst))
    );
  });
  if (!match) return null;
  return num(match.fields[HOURS_SUMMARY_FIELDS.previousYearHours]);
}
