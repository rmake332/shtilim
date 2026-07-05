import 'server-only';
import { getRecord, listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, PREV_YEAR_FIELDS, MOSAD_FIELDS } from '@/lib/airtable/schema';
import { findEmployeeByExactId } from '@/lib/employees';

export interface PrevYearNewRole {
  /** Resolved institution token (derived server-side from the prior-year row's mosad name). */
  token: string;
  /** Matched עובד record id when the row's ת.ז is already in רשימת עובדים; null otherwise. */
  employeeId: string | null;
  /** The תשפ"ו row id — carried through so submit can mark it "נוסף תקן חדש". */
  prevYearRecordId: string;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return '';
    if (typeof first === 'object' && 'name' in (first as object)) return String((first as { name: string }).name);
    return String(first);
  }
  if (typeof v === 'object' && 'name' in (v as object)) return String((v as { name: string }).name);
  return String(v);
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Load just enough from a prior-year (תשפ"ו) position to start a brand-new position for the
 * same employee at the same institution: { token, employeeId }. Unlike loadPrevYearFull, no
 * role/schedule is carried over — the secretary picks the role and enters hours from scratch.
 *
 * Returns null when the institution can't be resolved (unknown / inactive token).
 */
export async function loadPrevYearForNewRole(
  prevYearId: string,
  requestId?: string,
): Promise<PrevYearNewRole | null> {
  const row = await getRecord(TABLES.prevYearPositions, prevYearId, requestId);
  if (!row) return null;
  const pf = row.fields;

  const tz = normalize(str(pf[PREV_YEAR_FIELDS.tz]));
  const mosadName = normalize(str(pf[PREV_YEAR_FIELDS.mosad]));

  if (!mosadName) return null;
  const mosadRecs = await listRecords(
    TABLES.mosadot,
    {
      filterByFormula: `AND({${MOSAD_FIELDS.name}}="${escapeFormulaValue(mosadName)}", {${MOSAD_FIELDS.formActive}}=TRUE())`,
      maxRecords: 1,
      fields: [MOSAD_FIELDS.name, MOSAD_FIELDS.formToken],
    },
    requestId,
  );
  const mosad = mosadRecs[0];
  if (!mosad) return null;
  const token = str(mosad.fields[MOSAD_FIELDS.formToken]);
  if (!token) return null;

  let employeeId: string | null = null;
  if (tz) {
    const existing = await findEmployeeByExactId(tz, requestId);
    employeeId = existing?.id ?? null;
  }

  return { token, employeeId, prevYearRecordId: prevYearId };
}
