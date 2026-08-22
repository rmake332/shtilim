import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow } from '@/lib/invoice/positions';
import { markMonthFinished, saveDocUrlForMonth, listReportsForPositions } from '@/lib/invoice/reports';
import { getEmployeeById } from '@/lib/employees';
import { generatePaymentRequestDoc, type PaymentRequestRow } from '@/lib/invoice/paymentRequestDoc';
import { notifyPaymentRequestEmail } from '@/lib/makeWebhook';
import { logger } from '@/lib/logger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/invoice/budget-rows/[id]/finish-report - מסמן שהדיווח החודשי לתקן זה
 * (לחודש הנתון) הושלם (checkbox על כל שורות הדיווח המקושרות), מפיק מסמך "בקשת תשלום"
 * אמיתי בגוגל דוקס + PDF מאוחד עם כל החשבוניות (ראו src/lib/invoice/paymentRequestDoc.ts),
 * ושולח אותו במייל (Make webhook) לכתובת שהוזנה + רשימת ההעתקים של המוסד.
 *
 * **נעילה מלאה**: אם החודש הזה כבר הושלם בעבר (checkbox כבר מסומן), הבקשה נדחית -
 * אין אפשרות "לשלוח שוב"/לתקן אחרי שליחה (v1, לפי בקשת המשתמשת).
 *
 * שלוש פעולות נפרדות בכוונה: סימון ה-checkbox, הפקת המסמך, ושליחת המייל - כל אחת
 * יכולה להצליח או להיכשל בנפרד, בלי לחסום את הקודמות לה (docError/emailError נפרדים).
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
  let count: number;
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
    count = await markMonthFinished(positionIds, month, gate.requestId);
    if (count === 0) {
      return NextResponse.json({ ok: false, message: 'אין עדיין דיווחים לחודש זה.' }, { status: 400 });
    }
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'finish-report failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בסימון סיום הדיווח.' }, { status: 500 });
  }

  let docUrl: string | null = null;
  let folderUrl: string | null = null;
  let mergedPdfUrl: string | null = null;
  let docError: string | null = null;
  let emailError: string | null = null;
  try {
    const positionIds = positions.map((p) => p.id);
    const positionsById = new Map(positions.map((p) => [p.id, p]));

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
    await saveDocUrlForMonth(positionIds, month, { docUrl, folderUrl, mergedPdfUrl }, gate.requestId);

    const emailResult = await notifyPaymentRequestEmail(
      {
        to: toEmail,
        cc: gate.institution.paymentRequestCcEmails,
        institution: gate.institution.name,
        month,
        docUrl: mergedPdfUrl,
        folderUrl,
      },
      gate.requestId,
    );
    if (!emailResult.ok) emailError = emailResult.message ?? 'שליחת המייל נכשלה.';
  } catch (e) {
    logger.error(
      { requestId: gate.requestId, budgetRowId: params.id, month, err: String(e) },
      'payment request doc generation failed',
    );
    docError = e instanceof Error ? e.message : 'שגיאה בהפקת מסמך בקשת התשלום.';
  }

  return NextResponse.json({ ok: true, reportCount: count, docUrl, folderUrl, mergedPdfUrl, docError, emailError });
}
