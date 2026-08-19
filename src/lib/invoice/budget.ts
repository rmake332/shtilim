import 'server-only';
import { listRecords, escapeFormulaValue, type AirtableRecord } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS, CATEGORY } from '@/lib/airtable/schema';

/** שורת תקציב בקטגוריית חשבונית, כפי שמוצגת/נערכת במודול "תקני חשבונית". */
export interface InvoiceBudgetRow {
  id: string;
  title: string;
  /** שעות לניצול - מכסה חודשית (reuse של "סך שעות בתקציב", לא שדה נפרד). */
  monthlyHoursQuota: number;
  tariffMonthly: number;
  /** null כשאחד מהערכים חסר/אפס בתקציב (הפורמולה לא מחושבת). */
  maxHourlyRate: number | null;
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
  const maxRateRaw = f[BUDGET_FIELDS.maxHourlyRate];
  return {
    id: r.id,
    title: str(f[BUDGET_FIELDS.role]),
    monthlyHoursQuota: num(f[BUDGET_FIELDS.totalBudgetHours]),
    tariffMonthly: num(f[BUDGET_FIELDS.tariffMonthly]),
    maxHourlyRate: maxRateRaw == null || maxRateRaw === '' ? null : num(maxRateRaw),
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
  BUDGET_FIELDS.maxHourlyRate,
  BUDGET_FIELDS.totalAllocatedHours,
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
