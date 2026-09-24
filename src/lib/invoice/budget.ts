import 'server-only';
import { listRecords, updateRecord, escapeFormulaValue, type AirtableRecord } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS, CATEGORY } from '@/lib/airtable/schema';
import { maxHourlyRateFor } from '@/lib/invoice/rates';

/** שורת תקציב בקטגוריית חשבונית, כפי שמוצגת/נערכת במודול "תקני חשבונית". */
export interface InvoiceBudgetRow {
  id: string;
  title: string;
  /** שעות לניצול - מכסה **שבועית** (reuse של "סך שעות בתקציב"). לחודש: monthlyHoursFor. */
  weeklyHoursQuota: number;
  tariffMonthly: number;
  /** null כשאחד מהערכים חסר/אפס. מחושב בקוד (maxHourlyRateFor), לא נקרא מהפורמולה. */
  maxHourlyRate: number | null;
  /** "סיום הקצאה שנתית" נלחץ - המוסד לא יכול לערוך את ההקצאה עד פתיחה בממשק המנהל. */
  allocationLocked: boolean;
  totalAllocatedHours: number;
  remainingHoursToAllocate: number;
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

function mapBudgetRow(r: AirtableRecord): InvoiceBudgetRow {
  const f = r.fields;
  const weeklyHoursQuota = num(f[BUDGET_FIELDS.totalBudgetHours]);
  const tariffMonthly = num(f[BUDGET_FIELDS.tariffMonthly]);
  return {
    id: r.id,
    title: str(f[BUDGET_FIELDS.role]),
    weeklyHoursQuota,
    tariffMonthly,
    maxHourlyRate: maxHourlyRateFor(tariffMonthly, weeklyHoursQuota),
    allocationLocked: Boolean(f[BUDGET_FIELDS.invoiceAllocationLocked]),
    totalAllocatedHours: num(f[BUDGET_FIELDS.totalAllocatedHours]),
    remainingHoursToAllocate: num(f[BUDGET_FIELDS.remainingHoursToAllocate]),
  };
}

const FIELDS = [
  BUDGET_FIELDS.role,
  BUDGET_FIELDS.category,
  BUDGET_FIELDS.institutionLink,
  BUDGET_FIELDS.totalBudgetHours,
  BUDGET_FIELDS.tariffMonthly,
  BUDGET_FIELDS.totalAllocatedHours,
  BUDGET_FIELDS.invoiceAllocationLocked,
  BUDGET_FIELDS.remainingHoursToAllocate,
];

/**
 * כל שורות התקציב בקטגוריית חשבונית עבור מוסד. תמיד חי (לא קאש) - הנתונים האלה
 * נערכים תדיר באותה זרימה (הקצאה/דיווח), בניגוד ל-fetchBudgetForInstitution
 * (roles.ts) שמשמש את האשף הרגיל ומתעדכן דרך אוטומציית revalidate נפרדת.
 * מסונן לפי קטגוריה בנוסחת Airtable (זול, גם על טבלה של אלפי שורות), ולפי מוסד
 * ב-memory (בטוח יותר מהתאמת שם, כמו ב-fetchBudgetForInstitution).
 */
export async function fetchInvoiceBudgetRows(
  mosadId: string,
  requestId?: string,
): Promise<InvoiceBudgetRow[]> {
  const formula = `{${BUDGET_FIELDS.category}}="${escapeFormulaValue(CATEGORY.invoice)}"`;
  const all = await listRecords(TABLES.budget, { filterByFormula: formula, fields: FIELDS }, requestId);
  return all
    .filter((r) => recordLinks(r.fields[BUDGET_FIELDS.institutionLink]).includes(mosadId))
    .map(mapBudgetRow);
}

/** שורת תקציב חשבונית בודדת, מאומתת מול המוסד. */
export async function fetchInvoiceBudgetRow(
  mosadId: string,
  budgetRowId: string,
  requestId?: string,
): Promise<InvoiceBudgetRow | null> {
  const rows = await fetchInvoiceBudgetRows(mosadId, requestId);
  return rows.find((r) => r.id === budgetRowId) ?? null;
}

/** שורת תקציב חשבונית עם המוסד שלה - לממשק המנהל, שרואה את כל המוסדות. */
export interface InvoiceBudgetRowWithMosad extends InvoiceBudgetRow {
  mosadId: string;
}

/** כל שורות התקציב בקטגוריית חשבונית, בכל המוסדות (ממשק מנהל בלבד). */
export async function fetchAllInvoiceBudgetRows(requestId?: string): Promise<InvoiceBudgetRowWithMosad[]> {
  const formula = `{${BUDGET_FIELDS.category}}="${escapeFormulaValue(CATEGORY.invoice)}"`;
  const all = await listRecords(TABLES.budget, { filterByFormula: formula, fields: FIELDS }, requestId);
  return all.map((r) => ({
    ...mapBudgetRow(r),
    mosadId: recordLinks(r.fields[BUDGET_FIELDS.institutionLink])[0] ?? '',
  }));
}

/** נעילה/פתיחה של עריכת ההקצאה השנתית לשורת תקציב. */
export async function setAllocationLocked(budgetRowId: string, locked: boolean, requestId?: string): Promise<void> {
  await updateRecord(TABLES.budget, budgetRowId, { [BUDGET_FIELDS.invoiceAllocationLocked]: locked }, requestId);
}
