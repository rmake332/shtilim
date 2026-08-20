import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow } from '@/lib/invoice/positions';
import { listReportsForPositions, markMonthFinished, saveDocUrlForMonth } from '@/lib/invoice/reports';
import { getEmployeeById } from '@/lib/employees';
import { generatePaymentRequestDoc, type PaymentRequestRow } from '@/lib/invoice/paymentRequestDoc';
import { logger } from '@/lib/logger';

/**
 * POST /api/invoice/budget-rows/[id]/finish-report - מסמן שהדיווח החודשי לתקן זה
 * (לחודש הנתון) הושלם (checkbox על כל שורות הדיווח המקושרות), ואז מפיק מסמך "בקשת
 * תשלום" אמיתי בגוגל דוקס (Drive API, ראו src/lib/invoice/paymentRequestDoc.ts).
 *
 * שתי פעולות נפרדות בכוונה: אם הפקת המסמך נכשלת (auth/quota וכו') הדיווח כבר סומן
 * כהושלם בכל מקרה - השגיאה מוחזרת בנפרד (docError) ולא חוסמת את הסימון עצמו.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const month = String(body.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, message: 'חודש לא תקין.' }, { status: 400 });
  }

  let row;
  let positions;
  let count: number;
  try {
    row = await fetchInvoiceBudgetRow(gate.institution.mosadId, params.id, gate.requestId);
    if (!row) {
      return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });
    }
    positions = await listPositionsForBudgetRow(params.id, gate.requestId);
    count = await markMonthFinished(positions.map((p) => p.id), month, gate.requestId);
    if (count === 0) {
      return NextResponse.json({ ok: false, message: 'אין עדיין דיווחים לחודש זה.' }, { status: 400 });
    }
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'finish-report failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בסימון סיום הדיווח.' }, { status: 500 });
  }

  let docUrl: string | null = null;
  let docError: string | null = null;
  try {
    const positionIds = positions.map((p) => p.id);
    const reports = await listReportsForPositions(positionIds, month, gate.requestId);
    const positionsById = new Map(positions.map((p) => [p.id, p]));

    const rows: PaymentRequestRow[] = [];
    for (const report of reports) {
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
      });
    }

    const previousDocUrl = reports.find((r) => r.paymentRequestDocUrl)?.paymentRequestDocUrl;
    const generated = await generatePaymentRequestDoc(
      { institutionName: gate.institution.name, month, rows, previousDocUrl },
      gate.requestId,
    );
    docUrl = generated.url;
    await saveDocUrlForMonth(positionIds, month, docUrl, gate.requestId);
  } catch (e) {
    logger.error(
      { requestId: gate.requestId, budgetRowId: params.id, month, err: String(e) },
      'payment request doc generation failed',
    );
    docError = e instanceof Error ? e.message : 'שגיאה בהפקת מסמך בקשת התשלום.';
  }

  return NextResponse.json({ ok: true, reportCount: count, docUrl, docError });
}
