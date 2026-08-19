import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow } from '@/lib/invoice/positions';
import { markMonthFinished } from '@/lib/invoice/reports';
import { logger } from '@/lib/logger';

/**
 * POST /api/invoice/budget-rows/[id]/finish-report - מסמן שהדיווח החודשי לתקן זה
 * (לחודש הנתון) הושלם (checkbox על כל שורות הדיווח המקושרות). **Stub בלבד**: אין
 * עדיין טמפלייט להפקת "בקשת העברות" בגוגל דוקס - יתווסף בהמשך.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const month = String(body.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, message: 'חודש לא תקין.' }, { status: 400 });
  }

  try {
    const row = await fetchInvoiceBudgetRow(gate.institution.mosadId, params.id, gate.requestId);
    if (!row) {
      return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });
    }
    const positions = await listPositionsForBudgetRow(params.id, gate.requestId);
    const count = await markMonthFinished(positions.map((p) => p.id), month, gate.requestId);
    if (count === 0) {
      return NextResponse.json({ ok: false, message: 'אין עדיין דיווחים לחודש זה.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, reportCount: count });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'finish-report failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בסימון סיום הדיווח.' }, { status: 500 });
  }
}
