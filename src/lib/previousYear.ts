import 'server-only';
import { PREV_YEAR_FIELDS } from '@/lib/airtable/schema';
import { fetchPrevYearRowsByTz } from '@/lib/prevYearPosition';

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  return String(v);
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** ת.ז. is 9 digits; the source data stores it both padded and unpadded. */
function normalizeTz(s: string): string {
  return s.replace(/\D/g, '').padStart(9, '0');
}

/**
 * Previous-year (תשפ"ו) weekly hours for an employee, summed LIVE from תקנים תשפו
 * over every prior position matching ת.ז. + קטגוריה + מוסד + שכבה.
 *
 * Scoped identically to the current-year side of the comparison (see
 * sumExistingPositions' sameInstitution totals) so both sides cover the same set of
 * positions. Returns null when the employee had no matching prior position — the
 * reduction check is then skipped rather than treated as a drop to zero.
 */
export async function getPreviousYearHours(
  params: { tz: string; category: string; mosadName: string; layer: string },
  requestId?: string,
): Promise<number | null> {
  void requestId; // rows are fetched through the shared per-tz cache
  const rows = await fetchPrevYearRowsByTz(params.tz);

  const normTz = normalizeTz(params.tz);
  const normCategory = normalize(params.category);
  const normMosad = normalize(params.mosadName);
  const normLayer = normalize(params.layer);

  let total = 0;
  let matched = 0;
  for (const row of rows) {
    const f = row.fields;
    // Match tz robustly: source data and form may differ on leading zeros.
    if (normalizeTz(text(f[PREV_YEAR_FIELDS.tz])) !== normTz) continue;
    if (normalize(text(f[PREV_YEAR_FIELDS.category])) !== normCategory) continue;
    if (normalize(text(f[PREV_YEAR_FIELDS.mosad])) !== normMosad) continue;
    if (normLayer && normalize(text(f[PREV_YEAR_FIELDS.layer])) !== normLayer) continue;
    total += num(f[PREV_YEAR_FIELDS.weeklyHours]);
    matched++;
  }

  return matched > 0 ? total : null;
}
