import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow } from '@/lib/invoice/positions';
import { markMonthFinished, saveDocUrlForMonth, listReportsForPositions } from '@/lib/invoice/reports';
import { getEmployeeById } from '@/lib/employees';
import { generatePaymentRequestDoc, type PaymentRequestRow } from '@/lib/invoice/paymentRequestDoc';
import { finalizeMonthBalance } from '@/lib/invoice/monthlyBalance';
import { notifyPaymentRequestEmail } from '@/lib/makeWebhook';
import { logger } from '@/lib/logger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/invoice/budget-rows/[id]/finish-report - מפיק מסמך "בקשת תשלום" אמיתי
 * בגוגל דוקס + PDF מאוחד עם כל החשבוניות (ראו src/lib/invoice/paymentRequestDoc.ts),
 * קובע את יתרת השעות/התקציב (₪) הזמינה להעברה לחודש הבא (finalizeMonthBalance, ראו
 * src/lib/invoice/monthlyBalance.ts), שולח את המסמך במייל (Make webhook, לפי fileId
 * של ה-PDF המאוחד) לכתובת שהוזנה + רשימת ההעתקים של המוסד, ורק לאחר מכן מסמן
 * שהדיווח החודשי לתקן זה (לחודש הנתון) הושלם (checkbox על כל שורות הדיווח).
 *
 * **סדר הפעולות קריטי**: הפקת המסמך קודמת לנעילה בכוונה - אם ההפקה נכשלת (Drive/
 * quota/auth), החודש **לא** ננעל, כדי שאפשר יהיה לנסות "סיום דיווח" שוב. קביעת
 * היתרה קודמת גם היא לנעילה (ולא הפוך) - אם היא נכשלת, החודש נשאר פתוח, כדי
 * שלעולם לא ייווצר מצב של חודש נעול בלי שורת יתרה תואמת (שהייתה גורמת לחודש
 * הבא "לדלג" עליו כאילו לא דווח בכלל). נעילה (v1, מלאה, בלי אפשרות פתיחה
 * מחדש) קורית רק אחרי שהמסמך אכן נוצר בהצלחה, נשמר, והיתרה נקבעה. שליחת המייל
 * בסוף היא לא-חוסמת (emailError נפרד) - כשל בה לא מבטל את הנעילה, כי המסמך כבר
 * קיים ונשמר; המשתמשת יכולה לפתוח אותו ידנית מהקישור המוצג ב-UI.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const month = String(body.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, message: 'חודש לא תקין.' }, { status: 400 });
  }
  const toEmail = String(body.toEmail || '').trim();
  if (!EMAIL_RE.test(toEmail)) {
    return NextResponse.json({ ok: false, message: 'יש להזין כתובת מייל תקינה לשליחת בקשת התשלום.' }, { status: 400 });
  }

  let row;
  let positions;
  let existingReports;
  try {
    row = await fetchInvoiceBudgetRow(gate.institution.mosadId, params.id, gate.requestId);
    if (!row) {
      return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });
    }
    positions = await listPositionsForBudgetRow(params.id, gate.requestId);
    const positionIds = positions.map((p) => p.id);
    existingReports = await listReportsForPositions(positionIds, month, gate.requestId);
    if (existingReports.some((r) => r.monthlyTransferDocGenerated)) {
      return NextResponse.json(
        { ok: false, message: 'חודש זה כבר ננעל - בקשת התשלום כבר נשלחה עבורו.' },
        { status: 409 },
      );
    }
    if (existingReports.length === 0) {
      return NextResponse.json({ ok: false, message: 'אין עדיין דיווחים לחודש זה.' }, { status: 400 });
    }
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'finish-report data load failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בטעינת נתוני הדיווח.' }, { status: 500 });
  }

  const positionIds = positions.map((p) => p.id);
  const positionsById = new Map(positions.map((p) => [p.id, p]));

  let docUrl: string;
  let folderUrl: string;
  let mergedPdfUrl: string;
  let mergedPdfFileId: string;
  try {
    const rows: PaymentRequestRow[] = [];
    for (const report of existingReports) {
      const position = positionsById.get(report.positionId);
      if (!position) continue;
      const employee = await getEmployeeById(position.employeeId, gate.requestId);
      rows.push({
        employeeName: position.employeeName,
        invoiceNumber: report.invoiceNumber,
        vatNumber: employee?.vatNumber ?? '',
        bankName: employee?.bankName ?? '',
        bankBranch: employee?.bankBranch ?? '',
        bankAccountNumber: employee?.bankAccountNumber ?? '',
        budgetLine: row.title,
        amount: report.totalPay,
        invoiceAttachment: report.invoiceAttachment,
      });
    }

    const previousDocUrl = existingReports.find((r) => r.paymentRequestDocUrl)?.paymentRequestDocUrl;
    const generated = await generatePaymentRequestDoc(
      { institutionName: gate.institution.name, month, rows, previousDocUrl },
      gate.requestId,
    );
    docUrl = generated.url;
    folderUrl = generated.folderUrl;
    mergedPdfUrl = generated.mergedPdfUrl;
    mergedPdfFileId = generated.mergedPdfFileId;
  } catch (e) {
    logger.error(
      { requestId: gate.requestId, budgetRowId: params.id, month, err: String(e) },
      'payment request doc generation failed',
    );
    const message = e instanceof Error ? e.message : 'שגיאה בהפקת מסמך בקשת התשלום.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }

  let count: number;
  let emailError: string | null = null;
  try {
    const reportedHoursTotal = existingReports.reduce((sum, r) => sum + r.reportedHours, 0);
    const paidTotal = existingReports.reduce((sum, r) => sum + r.totalPay, 0);
    await finalizeMonthBalance(
      {
        budgetRowId: params.id,
        budgetRowTitle: row.title,
        month,
        quotaSnapshot: row.monthlyHoursQuota,
        reportedHoursTotal,
        budgetSnapshot: row.tariffMonthly,
        paidTotal,
      },
      gate.requestId,
    );
    await saveDocUrlForMonth(positionIds, month, { docUrl, folderUrl, mergedPdfUrl }, gate.requestId);
    count = await markMonthFinished(positionIds, month, gate.requestId);

    const emailResult = await notifyPaymentRequestEmail(
      {
        fileId: mergedPdfFileId,
        to: toEmail,
        cc: gate.institution.paymentRequestCcEmails,
        institution: gate.institution.name,
        role: row.title,
        month,
      },
      gate.requestId,
    );
    if (!emailResult.ok) emailError = emailResult.message ?? 'שליחת המייל נכשלה.';
  } catch (e) {
    // המסמך כבר נוצר ונשמר בהצלחה (docUrl/folderUrl/mergedPdfUrl תקינים) - רק
    // קביעת היתרה/הנעילה/השמירה נכשלה. לא ננעל, כדי שניסיון חוזר יגלה את
    // previousDocUrl וידרוס אותו במקום ליצור כפילות (ראו הערת "דריסה" ב-
    // generatePaymentRequestDoc), ו-finalizeMonthBalance עצמו אידמפוטנטי (upsert)
    // כך שקריאה חוזרת לו לא יוצרת שורת יתרה כפולה.
    logger.error(
      { requestId: gate.requestId, budgetRowId: params.id, month, err: String(e) },
      'finish-report lock/save failed after doc generation succeeded',
    );
    return NextResponse.json(
      {
        ok: false,
        message: 'המסמך הופק בהצלחה אך סימון הדיווח כהושלם נכשל - נסו "סיום דיווח חודשי" שוב.',
        docUrl,
        folderUrl,
        mergedPdfUrl,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, reportCount: count, docUrl, folderUrl, mergedPdfUrl, docError: null, emailError });
}
