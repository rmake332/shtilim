import 'server-only';
import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  type AirtableRecord,
} from '@/lib/airtable/client';
import { TABLES, INVOICE_POSITION_FIELDS } from '@/lib/airtable/schema';

/** הקצאת עובד יחיד תחת שורת תקציב חשבונית אחת. */
export interface InvoicePosition {
  id: string;
  budgetRowId: string;
  employeeId: string;
  employeeName: string;
  subRole: string;
  allocatedHours: number;
  agreedHourlyRate: number;
  allocationTransferDocGenerated: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    return String((v as { name: unknown }).name);
  }
  return String(v);
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

function mapPosition(r: AirtableRecord): InvoicePosition {
  const f = r.fields;
  return {
    id: r.id,
    budgetRowId: recordLinks(f[INVOICE_POSITION_FIELDS.budgetLink])[0] ?? '',
    employeeId: recordLinks(f[INVOICE_POSITION_FIELDS.employeeLink])[0] ?? '',
    employeeName: str(f[INVOICE_POSITION_FIELDS.employeeName]),
    subRole: str(f[INVOICE_POSITION_FIELDS.subRole]),
    allocatedHours: num(f[INVOICE_POSITION_FIELDS.allocatedHours]),
    agreedHourlyRate: num(f[INVOICE_POSITION_FIELDS.agreedHourlyRate]),
    allocationTransferDocGenerated: Boolean(f[INVOICE_POSITION_FIELDS.allocationTransferDocGenerated]),
  };
}

/**
 * כל ההקצאות (עובדים) תחת שורת תקציב חשבונית אחת. תמיד חי - נערך תדיר באותה זרימה.
 * מסונן ב-memory (לא filterByFormula): ARRAYJOIN על שדה multipleRecordLinks מחזיר את
 * שמות הרשומות המקושרות (השדה הראשי שלהן), לא את מזהיהן - אין דרך לסנן לפי record id
 * ישירות בנוסחת Airtable על שדה כזה. הטבלה קטנה (עובדים בודדים לתקן), אז זה זול.
 */
export async function listPositionsForBudgetRow(
  budgetRowId: string,
  requestId?: string,
): Promise<InvoicePosition[]> {
  const records = await listRecords(TABLES.invoicePositions, {}, requestId);
  return records
    .filter((r) => recordLinks(r.fields[INVOICE_POSITION_FIELDS.budgetLink]).includes(budgetRowId))
    .map(mapPosition);
}

export async function getPosition(positionId: string, requestId?: string): Promise<InvoicePosition | null> {
  const r = await getRecord(TABLES.invoicePositions, positionId, requestId);
  return r ? mapPosition(r) : null;
}

export async function createPosition(
  params: {
    budgetRowId: string;
    employeeId: string;
    employeeName: string;
    subRole: string;
    allocatedHours: number;
    agreedHourlyRate: number;
  },
  requestId?: string,
): Promise<InvoicePosition> {
  // Airtable's create response isn't keyed by field ID (only GET/list requests set
  // returnFieldsByFieldId) - build the result from the known params instead of the response.
  const r = await createRecord(
    TABLES.invoicePositions,
    {
      [INVOICE_POSITION_FIELDS.budgetLink]: [params.budgetRowId],
      [INVOICE_POSITION_FIELDS.employeeLink]: [params.employeeId],
      [INVOICE_POSITION_FIELDS.employeeName]: params.employeeName,
      [INVOICE_POSITION_FIELDS.subRole]: params.subRole,
      [INVOICE_POSITION_FIELDS.allocatedHours]: params.allocatedHours,
      [INVOICE_POSITION_FIELDS.agreedHourlyRate]: params.agreedHourlyRate,
    },
    requestId,
  );
  return {
    id: r.id,
    budgetRowId: params.budgetRowId,
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    subRole: params.subRole,
    allocatedHours: params.allocatedHours,
    agreedHourlyRate: params.agreedHourlyRate,
    allocationTransferDocGenerated: false,
  };
}

export async function updatePosition(
  positionId: string,
  params: Partial<{ subRole: string; allocatedHours: number; agreedHourlyRate: number }>,
  requestId?: string,
): Promise<InvoicePosition> {
  const current = await getPosition(positionId, requestId);
  if (!current) throw new Error(`invoice position not found: ${positionId}`);

  const fields: Record<string, unknown> = {};
  if (params.subRole !== undefined) fields[INVOICE_POSITION_FIELDS.subRole] = params.subRole;
  if (params.allocatedHours !== undefined) fields[INVOICE_POSITION_FIELDS.allocatedHours] = params.allocatedHours;
  if (params.agreedHourlyRate !== undefined) {
    fields[INVOICE_POSITION_FIELDS.agreedHourlyRate] = params.agreedHourlyRate;
  }
  // Airtable's update response isn't keyed by field ID (only GET/list requests set
  // returnFieldsByFieldId) - merge onto the pre-fetched record instead of the response.
  // Spreading params directly would overwrite unset fields with explicit `undefined`
  // (JSON.stringify hides it, but the in-memory object - and any further caller - loses
  // the value), so only the keys actually present are merged in.
  await updateRecord(TABLES.invoicePositions, positionId, fields, requestId);
  const defined = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  return { ...current, ...defined };
}

export async function deletePosition(positionId: string, requestId?: string): Promise<void> {
  await deleteRecord(TABLES.invoicePositions, positionId, requestId);
}

/** מסמן את כל ההקצאות תחת שורת תקציב כ"בקשת העברות הופקה" (stub - אין עדיין הפקת מסמך בפועל). */
export async function markAllocationFinished(budgetRowId: string, requestId?: string): Promise<number> {
  const positions = await listPositionsForBudgetRow(budgetRowId, requestId);
  for (const p of positions) {
    await updateRecord(
      TABLES.invoicePositions,
      p.id,
      { [INVOICE_POSITION_FIELDS.allocationTransferDocGenerated]: true },
      requestId,
    );
  }
  return positions.length;
}
