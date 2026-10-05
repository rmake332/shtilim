import 'server-only';
import { listRecords } from '@/lib/airtable/client';
import { TABLES, MOSAD_FIELDS } from '@/lib/airtable/schema';
import type { InvoiceBudgetRowInput } from '@/lib/invoice/budget';

/**
 * קלט שורת תקציב חשבונית מגוף בקשה של ממשק המנהל, מאומת. מחזיר הודעת שגיאה במקום
 * הקלט כשהוא לא תקין. משותף ליצירה ולעריכה.
 */
export async function parseBudgetRowInput(
  body: Record<string, unknown>,
  requestId: string,
): Promise<InvoiceBudgetRowInput | string> {
  const mosadId = String(body.mosadId || '');
  const title = String(body.title || '').trim();
  const weeklyHoursQuota = Number(body.weeklyHoursQuota);
  const tariffMonthly = Number(body.tariffMonthly);
  if (!mosadId) return 'יש לבחור מוסד.';
  if (!title) return 'יש להזין שם תפקיד.';
  if (!Number.isFinite(weeklyHoursQuota) || weeklyHoursQuota <= 0) return 'יש להזין שעות שבועיות גדולות מ-0.';
  if (!Number.isFinite(tariffMonthly) || tariffMonthly <= 0) return 'יש להזין תקציב חודשי גדול מ-0.';
  // בדיקה מול רשימת המוסדות ולא getRecord: מזהה לא קיים זורק שם 404, שלא ניתן
  // להבחין בינו לבין תקלת רשת. הטבלה קטנה (עשרות שורות).
  const mosadot = await listRecords(TABLES.mosadot, { fields: [MOSAD_FIELDS.name] }, requestId);
  if (!mosadot.some((m) => m.id === mosadId)) return 'המוסד לא נמצא.';
  return { mosadId, title, weeklyHoursQuota, tariffMonthly };
}
