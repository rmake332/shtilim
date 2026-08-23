import 'server-only';
import { getRecord, listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS, INVOICE_POSITION_FIELDS, INVOICE_REPORT_FIELDS } from '@/lib/airtable/schema';
import { formatNum } from '@/lib/formatNum';
import { getCarryInBalance } from '@/lib/invoice/monthlyBalance';

export interface InvoiceCheckResult {
  ok: boolean;
  message: string | null;
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

/**
 * כל ההקצאות תחת שורת תקציב, ב-memory: ARRAYJOIN על שדה multipleRecordLinks מחזיר
 * שמות ולא מזהים, כך שאין דרך לסנן לפי record id ישירות בנוסחת Airtable על שדה כזה.
 */
async function positionsForBudgetRow(budgetRowId: string, requestId?: string) {
  const all = await listRecords(TABLES.invoicePositions, {}, requestId);
  return all.filter((p) => recordLinks(p.fields[INVOICE_POSITION_FIELDS.budgetLink]).includes(budgetRowId));
}

/**
 * בדיקת חריגה מול הערך החי באיירטייבל בזמן הקצאת/עריכת עובד לתקן חשבונית - לא מול
 * snapshot שהלקוח מחזיק. אותו טעם כמו checkLiveBudget (src/lib/schedule/budgetCheck.ts):
 * בלי הבדיקה הזו, כמה עובדים שמוקצים בסמיכות לאותה שורת תקציב יכולים כל אחד "לעבור"
 * מול אותה יתרה ישנה, גם כשביחד הם חורגים מהמכסה החודשית.
 */
export async function checkLiveAnnualAllocation(
  params: {
    budgetRowId: string;
    allocatedHours: number;
    agreedHourlyRate: number;
    /** בעריכת הקצאה קיימת - לא לספור אותה פעמיים מול עצמה. */
    excludePositionId?: string;
  },
  requestId?: string,
): Promise<InvoiceCheckResult> {
  const budget = await getRecord(TABLES.budget, params.budgetRowId, requestId);
  if (!budget) return { ok: true, message: null }; // מוק / שורה נמחקה - לא חוסמים

  const maxRate = Number(budget.fields[BUDGET_FIELDS.maxHourlyRate]);
  if (Number.isFinite(maxRate) && params.agreedHourlyRate > maxRate) {
    return {
      ok: false,
      message: `התעריף השעתי שהוזן (${formatNum(params.agreedHourlyRate)}) חורג מהתעריף השעתי המקסימלי לתקן (${formatNum(maxRate)}).`,
    };
  }

  const quota = Number(budget.fields[BUDGET_FIELDS.totalBudgetHours]);
  if (!Number.isFinite(quota)) return { ok: true, message: null };

  const positions = await positionsForBudgetRow(params.budgetRowId, requestId);
  const existingSum = positions
    .filter((p) => p.id !== params.excludePositionId)
    .reduce((sum, p) => sum + (Number(p.fields[INVOICE_POSITION_FIELDS.allocatedHours]) || 0), 0);

  const total = existingSum + params.allocatedHours;
  if (total > quota) {
    return {
      ok: false,
      message: `סה"כ השעות המוקצות לכלל העובדים (${formatNum(total)}) חורג מהמכסה החודשית של התקן (${formatNum(quota)}). ייתכן שעובד אחר הוקצה ממש עכשיו - יש לרענן ולנסות שוב.`,
    };
  }
  return { ok: true, message: null };
}

/**
 * בדיקת חריגה מול הערך החי באיירטייבל בזמן דיווח שעות חודשי: התעריף המדווח לא חורג
 * מהתעריף שנקבע לעובד בהקצאה השנתית, וסה"כ השעות המדווחות של כלל העובדים בתקן
 * לחודש הנתון לא חורג מהמכסה **הזמינה** לחודש - המכסה החודשית הרגילה + יתרה
 * שהועברה מחודשים קודמים (ראו getCarryInBalance, monthlyBalance.ts). מותר לעובד
 * בודד לדווח יותר שעות ממה שהוקצה לו אישית - אין בדיקה פר-עובד על שעות, רק על
 * הסכום המצטבר.
 */
export async function checkLiveMonthlyQuota(
  params: {
    budgetRowId: string;
    positionId: string;
    month: string;
    reportedHours: number;
    reportedRate: number;
    /** בעריכת דיווח קיים - לא לספור אותו פעמיים מול עצמו. */
    excludeReportId?: string;
  },
  requestId?: string,
): Promise<InvoiceCheckResult> {
  const position = await getRecord(TABLES.invoicePositions, params.positionId, requestId);
  const agreedRate = position ? Number(position.fields[INVOICE_POSITION_FIELDS.agreedHourlyRate]) : NaN;
  if (Number.isFinite(agreedRate) && params.reportedRate > agreedRate) {
    return {
      ok: false,
      message: `התעריף המדווח (${formatNum(params.reportedRate)}) חורג מהתעריף שנקבע לעובד זה בהקצאה השנתית (${formatNum(agreedRate)}).`,
    };
  }

  // מותר לעובד לדווח יותר שעות ממה שהוקצה לו אישית - הבדיקה היחידה על שעות היא
  // הסכום המצטבר של כלל העובדים בתקן מול המכסה הזמינה המשותפת (למטה).
  const budget = await getRecord(TABLES.budget, params.budgetRowId, requestId);
  const quota = budget ? Number(budget.fields[BUDGET_FIELDS.totalBudgetHours]) : NaN;
  if (!Number.isFinite(quota)) return { ok: true, message: null };

  const carriedIn = await getCarryInBalance(params.budgetRowId, params.month, requestId);
  const availableQuota = quota + carriedIn;

  const positions = await positionsForBudgetRow(params.budgetRowId, requestId);
  const positionIds = new Set(positions.map((p) => p.id));
  if (!positionIds.size) return { ok: true, message: null };

  const repFormula = `{${INVOICE_REPORT_FIELDS.reportMonth}}="${escapeFormulaValue(params.month)}"`;
  const allReports = await listRecords(TABLES.invoiceReports, { filterByFormula: repFormula }, requestId);
  const reports = allReports.filter((r) =>
    recordLinks(r.fields[INVOICE_REPORT_FIELDS.positionLink]).some((id) => positionIds.has(id)),
  );
  const existingSum = reports
    .filter((r) => r.id !== params.excludeReportId)
    .reduce((sum, r) => sum + (Number(r.fields[INVOICE_REPORT_FIELDS.reportedHours]) || 0), 0);

  const total = existingSum + params.reportedHours;
  if (total > availableQuota) {
    const carryNote = carriedIn > 0 ? `, כולל ${formatNum(carriedIn)} שעות יתרה שהועברו מחודשים קודמים` : '';
    return {
      ok: false,
      message: `סה"כ השעות המדווחות לחודש זה (${formatNum(total)}) חורג מהמכסה הזמינה לתקן (${formatNum(availableQuota)}${carryNote}). ייתכן שעובד אחר דיווח ממש עכשיו - יש לרענן ולנסות שוב.`,
    };
  }
  return { ok: true, message: null };
}
