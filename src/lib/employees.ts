import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, EMPLOYEE_FIELDS, SUB_ROLE_DOC_FIELDS, DOC_FIELDS } from '@/lib/airtable/schema';
import { maskTz } from '@/lib/logger';
import { normalizeIsraeliId } from '@/lib/validation/israeliId';

/** Public, safe-to-return employee search result. ID is masked; no address/birthdate/full email leak. */
export interface EmployeeSearchResult {
  id: string;
  name: string;
  maskedTz: string;
}

/**
 * Search employees by ת.ז. only.
 * NOTE: רשימת עובדים is a network-wide table. We return only id + name + masked ID,
 * and require a minimum of 4 ID digits to avoid enumeration (security req #3).
 */
export async function searchEmployees(
  query: string,
  requestId?: string,
): Promise<EmployeeSearchResult[]> {
  // ID search only — strip non-digits and require at least 4 digits.
  const digits = query.replace(/\D/g, '');
  if (digits.length < 4) return [];

  const safe = escapeFormulaValue(digits);
  const formula = `FIND("${safe}", {${EMPLOYEE_FIELDS.tz}})`;

  const records = await listRecords(
    TABLES.employees,
    {
      filterByFormula: formula,
      maxRecords: 10,
      fields: [EMPLOYEE_FIELDS.name, EMPLOYEE_FIELDS.tz],
    },
    requestId,
  );

  return records.map((r) => ({
    id: r.id,
    name: String(r.fields[EMPLOYEE_FIELDS.name] ?? ''),
    maskedTz: maskTz(String(r.fields[EMPLOYEE_FIELDS.tz] ?? '')),
  }));
}

/** Full employee details for the edit form (returned only after explicit selection). */
export interface EmployeeDetails {
  id: string;
  name: string;
  tz: string;
  address: string;
  email: string;
  phone: string;
  gender: string;
  maritalStatus: string;
  birthDate: string;
  ageHours: number;
  fatherPosition: boolean;
  licenseNumber: string;
  /** SUB_ROLE_DOC_FIELDS.fieldId values that already have an attachment on file. */
  existingSubRoleDocs: string[];
  /** DOC_FIELDS.fieldId values (youth/role documents) that already have an attachment on file. */
  existingYouthDocs: string[];
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  return String(v);
}

function fieldIdsWithAttachment(fieldIds: string[], fields: Record<string, unknown>): string[] {
  return fieldIds
    .filter((fieldId, idx, arr) => arr.indexOf(fieldId) === idx) // dedupe (fieldId repeats when reused across defs)
    .filter((fieldId) => {
      const v = fields[fieldId];
      return Array.isArray(v) && v.length > 0;
    });
}

/** Which SUB_ROLE_DOC_FIELDS.fieldId values already have an attachment in a רשימת עובדים fields object. */
export function existingSubRoleDocsFromFields(fields: Record<string, unknown>): string[] {
  return fieldIdsWithAttachment(SUB_ROLE_DOC_FIELDS.map((d) => d.fieldId), fields);
}

/**
 * Which DOC_FIELDS.fieldId values (youth/role documents filed on the employee) already
 * have an attachment in a רשימת עובדים fields object. docEmployment is excluded — it's
 * filed on the position, not the employee.
 */
export function existingYouthDocsFromFields(fields: Record<string, unknown>): string[] {
  return fieldIdsWithAttachment(
    DOC_FIELDS.filter((d) => d.key !== 'docEmployment').map((d) => d.fieldId),
    fields,
  );
}

/** Fetch a single employee's full fields by record id (for the editable detail form). */
export async function getEmployeeById(
  recordId: string,
  requestId?: string,
): Promise<EmployeeDetails | null> {
  if (!/^rec[A-Za-z0-9]{6,}$/.test(recordId)) return null;
  const records = await listRecords(
    TABLES.employees,
    { filterByFormula: `RECORD_ID()="${escapeFormulaValue(recordId)}"`, maxRecords: 1 },
    requestId,
  );
  const r = records[0];
  if (!r) return null;
  const f = r.fields;
  const existingSubRoleDocs = existingSubRoleDocsFromFields(f);
  const existingYouthDocs = existingYouthDocsFromFields(f);
  return {
    id: r.id,
    name: str(f[EMPLOYEE_FIELDS.name]),
    tz: str(f[EMPLOYEE_FIELDS.tz]),
    address: str(f[EMPLOYEE_FIELDS.address]),
    email: str(f[EMPLOYEE_FIELDS.email]),
    phone: str(f[EMPLOYEE_FIELDS.phone]),
    gender: str(f[EMPLOYEE_FIELDS.gender]),
    maritalStatus: str(f[EMPLOYEE_FIELDS.maritalStatus]),
    birthDate: str(f[EMPLOYEE_FIELDS.birthDate]),
    ageHours: Number(f[EMPLOYEE_FIELDS.ageHours]) || 0,
    fatherPosition: Boolean(f[EMPLOYEE_FIELDS.fatherPosition]),
    licenseNumber: str(f[EMPLOYEE_FIELDS.licenseNumber]),
    existingSubRoleDocs,
    existingYouthDocs,
  };
}

/**
 * Find an existing employee by EXACT ת.ז. (normalized, 9 digits).
 * Used to block creating a duplicate — if found, the existing employee is auto-selected.
 */
export async function findEmployeeByExactId(
  tz: string,
  requestId?: string,
): Promise<EmployeeSearchResult | null> {
  const normalized = normalizeIsraeliId(tz);
  if (!normalized) return null;

  // Match on the normalized ID and also on the raw digits, since stored IDs may be un-padded.
  const raw = String(tz).replace(/\D/g, '');
  const safeNorm = escapeFormulaValue(normalized);
  const safeRaw = escapeFormulaValue(raw);
  const f = EMPLOYEE_FIELDS.tz;
  const formula = `OR({${f}}="${safeNorm}", {${f}}="${safeRaw}")`;

  const records = await listRecords(
    TABLES.employees,
    { filterByFormula: formula, maxRecords: 1, fields: [EMPLOYEE_FIELDS.name, EMPLOYEE_FIELDS.tz] },
    requestId,
  );
  const r = records[0];
  if (!r) return null;
  return {
    id: r.id,
    name: String(r.fields[EMPLOYEE_FIELDS.name] ?? ''),
    maskedTz: maskTz(String(r.fields[EMPLOYEE_FIELDS.tz] ?? '')),
  };
}
