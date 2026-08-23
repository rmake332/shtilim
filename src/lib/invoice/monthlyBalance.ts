import 'server-only';
import { listRecords, createRecord, updateRecord, type AirtableRecord } from '@/lib/airtable/client';
import { TABLES, INVOICE_BALANCE_FIELDS } from '@/lib/airtable/schema';

export interface CarryInBalance {
  /** יתרת שעות זמינה, מעבר למכסה החודשית הרגילה. */
  hours: number;
  /** יתרת תקציב (₪) זמינה, מעבר לתעריף החודשי הרגיל. */
  budget: number;
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * כל שורות היתרה החודשית של שורת תקציב נתונה, ב-memory - כמו שאר הטבלאות
 * הקטנות בפיצ'ר הזה (ARRAYJOIN על multipleRecordLinks מחזיר שם, לא record id,
 * כך שאין דרך לסנן לפי id ישירות בנוסחת Airtable על שדה כזה).
 */
async function balanceRowsForBudgetRow(budgetRowId: string, requestId?: string): Promise<AirtableRecord[]> {
  const all = await listRecords(TABLES.invoiceMonthlyBalances, {}, requestId);
  return all.filter((r) => recordLinks(r.fields[INVOICE_BALANCE_FIELDS.budgetLink]).includes(budgetRowId));
}

/**
 * היתרה (שעות + תקציב) הזמינה לדיווח חודש נתון: הערכים היוצאים של שורת היתרה
 * הכי אחרונה (לפי חודש - מחרוזת "YYYY-MM", ממוינת לקסיקוגרפית נכון) שקטנה
 * מהחודש המבוקש. {0, 0} אם אין אף שורה קודמת.
 *
 * שורת יתרה נוצרת **רק** בעת נעילת חודש (`finalizeMonthBalance`, נקרא מ-
 * finish-report) - חודש שמעולם לא ננעל פשוט לא מקבל שורה, ולכן "מדולג" בחיפוש
 * הזה: הוא לא תורם את המכסה/התקציב המלאים שלו לשרשרת ההעברה, רק מה שכבר
 * הצטבר *לפניו* ממשיך לזלוג הלאה דרכו לחודש שאחריו. זה בדיוק המימוש של הכלל
 * "חודש שלא דווח לא מזכה במכסה המלאה שלו, רק ביתרה שכבר הייתה קיימת".
 */
export async function getCarryIn(budgetRowId: string, month: string, requestId?: string): Promise<CarryInBalance> {
  const rows = await balanceRowsForBudgetRow(budgetRowId, requestId);
  const prior = rows
    .filter((r) => String(r.fields[INVOICE_BALANCE_FIELDS.month] ?? '') < month)
    .sort((a, b) =>
      String(b.fields[INVOICE_BALANCE_FIELDS.month] ?? '').localeCompare(String(a.fields[INVOICE_BALANCE_FIELDS.month] ?? '')),
    );
  const latest = prior[0];
  if (!latest) return { hours: 0, budget: 0 };
  return {
    hours: num(latest.fields[INVOICE_BALANCE_FIELDS.carriedOut]),
    budget: num(latest.fields[INVOICE_BALANCE_FIELDS.budgetCarriedOut]),
  };
}

/**
 * יוצר/מעדכן (upsert אידמפוטנטי) את שורת היתרה של שורת תקציב+חודש, בעת נעילת
 * החודש (finish-report, לפני markMonthFinished). "יתרה נכנסת"/"יתרת תקציב
 * נכנסת" מחושבות פעם אחת בלבד, ביצירה - אם השורה כבר קיימת (ניסיון חוזר אחרי
 * כשל חלקי, ראו finish-report/route.ts) רק הסנאפשוטים וסיכומי החודש מתעדכנים,
 * כי חודשים קודמים כבר נעולים ולא משתנים בין הניסיונות.
 */
export async function finalizeMonthBalance(
  params: {
    budgetRowId: string;
    budgetRowTitle: string;
    /** פורמט "YYYY-MM". */
    month: string;
    quotaSnapshot: number;
    reportedHoursTotal: number;
    budgetSnapshot: number;
    paidTotal: number;
  },
  requestId?: string,
): Promise<void> {
  const rows = await balanceRowsForBudgetRow(params.budgetRowId, requestId);
  const existing = rows.find((r) => String(r.fields[INVOICE_BALANCE_FIELDS.month]) === params.month);
  const fields = {
    [INVOICE_BALANCE_FIELDS.quotaSnapshot]: params.quotaSnapshot,
    [INVOICE_BALANCE_FIELDS.reportedHoursTotal]: params.reportedHoursTotal,
    [INVOICE_BALANCE_FIELDS.budgetQuotaSnapshot]: params.budgetSnapshot,
    [INVOICE_BALANCE_FIELDS.paidTotal]: params.paidTotal,
  };
  if (existing) {
    await updateRecord(TABLES.invoiceMonthlyBalances, existing.id, fields, requestId);
    return;
  }
  const carriedIn = await getCarryIn(params.budgetRowId, params.month, requestId);
  await createRecord(
    TABLES.invoiceMonthlyBalances,
    {
      ...fields,
      [INVOICE_BALANCE_FIELDS.budgetLink]: [params.budgetRowId],
      [INVOICE_BALANCE_FIELDS.month]: params.month,
      [INVOICE_BALANCE_FIELDS.carriedIn]: carriedIn.hours,
      [INVOICE_BALANCE_FIELDS.budgetCarriedIn]: carriedIn.budget,
      [INVOICE_BALANCE_FIELDS.label]: `${params.budgetRowTitle} - ${params.month}`,
    },
    requestId,
  );
}
