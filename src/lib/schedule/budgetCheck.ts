import 'server-only';
import { getRecord } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS } from '@/lib/airtable/schema';
import { formatNum } from '@/lib/formatNum';

export interface BudgetCheckResult {
  ok: boolean;
  /** יתרה חיה מאיירטייבל ברגע הבדיקה (כולל extraCurrentHours, אם נשלח) — null כשלא ניתן לקרוא (מוק / שורה נמחקה), ואז לא חוסמים. */
  remaining: number | null;
  message: string | null;
}

/**
 * בדיקת חריגה מהתקציב מול הערך החי באיירטייבל בזמן הכתיבה בפועל (submit / עריכת
 * תקן) - לא מול ה-snapshot שהלקוח מחזיק (`role.remainingHours`), שמגיע מקאש
 * `fetchBudgetForInstitution` (`src/lib/roles.ts`, 120 שנ', משותף לכל המשתמשים)
 * ויכול לפגר גם מעבר לכך אם אוטומציית הרענון באיירטייבל לא מכסה את השדה שהשתנה
 * (ראה docs/airtable-cache-revalidation.md). בלי הבדיקה הזו, כמה תקנים לאותה שורת
 * תקציב שנשלחים בסמיכות יכולים כל אחד "לעבור" מול אותה יתרה ישנה, גם כשביחד הם
 * חורגים. זו רשת הביטחון האחרונה לפני הכתיבה, לא תחליף לבדיקה בטופס.
 *
 * extraCurrentHours: בעריכת תקן קיים, השעות שהתקן הזה עצמו כבר תרם ליתרה החיה -
 * מתווספות חזרה כדי לא להעניש אותו על עצמו.
 */
export async function checkLiveBudget(
  params: { roleId: string; utilizedHours: number; extraCurrentHours?: number },
  requestId?: string,
): Promise<BudgetCheckResult> {
  const utilizedHours = Number.isFinite(params.utilizedHours) ? params.utilizedHours : 0;
  if (!params.roleId || utilizedHours <= 0) return { ok: true, remaining: null, message: null };

  const rec = await getRecord(TABLES.budget, params.roleId, requestId);
  const raw = rec ? Number(rec.fields[BUDGET_FIELDS.remainingHours]) : NaN;
  if (!Number.isFinite(raw)) return { ok: true, remaining: null, message: null }; // מוק / שורה נמחקה - לא חוסמים

  const remaining = raw + (params.extraCurrentHours ?? 0);
  if (utilizedHours <= remaining) return { ok: true, remaining, message: null };

  return {
    ok: false,
    remaining,
    message: `מספר השעות שהוזן (${formatNum(utilizedHours)}) חורג מיתרת התקציב לתפקיד (${formatNum(remaining)}). ייתכן שתקן אחר לאותה שורת תקציב נשמר ממש עכשיו - יש לרענן ולנסות שוב.`,
  };
}
