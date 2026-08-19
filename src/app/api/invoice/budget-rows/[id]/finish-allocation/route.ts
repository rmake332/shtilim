import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { markAllocationFinished } from '@/lib/invoice/positions';
import { logger } from '@/lib/logger';

/**
 * POST /api/invoice/budget-rows/[id]/finish-allocation - מסמן שהקצאת השעות השנתית
 * לתקן זה הושלמה (checkbox על כל ההקצאות המקושרות). **Stub בלבד**: אין עדיין
 * טמפלייט להפקת "בקשת העברות" בגוגל דוקס - יתווסף בהמשך.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  try {
    const row = await fetchInvoiceBudgetRow(gate.institution.mosadId, params.id, gate.requestId);
    if (!row) {
      return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });
    }
    const count = await markAllocationFinished(params.id, gate.requestId);
    if (count === 0) {
      return NextResponse.json({ ok: false, message: 'אין עדיין עובדים מוקצים לתקן זה.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, employeeCount: count });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'finish-allocation failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בסימון סיום ההקצאה.' }, { status: 500 });
  }
}
