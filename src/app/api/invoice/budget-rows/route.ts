import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRows } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow } from '@/lib/invoice/positions';
import { logger } from '@/lib/logger';

/**
 * GET /api/invoice/budget-rows - כל שורות התקציב בקטגוריית חשבונית של המוסד, עם
 * מצב הקצאה נוכחי (מס' עובדים מוקצים, האם ההקצאה סומנה כהושלמה).
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  try {
    const rows = await fetchInvoiceBudgetRows(gate.institution.mosadId, gate.requestId);
    const withStatus = await Promise.all(
      rows.map(async (row) => {
        const positions = await listPositionsForBudgetRow(row.id, gate.requestId);
        return {
          ...row,
          employeeCount: positions.length,
          allocationFinished: positions.length > 0 && positions.every((p) => p.allocationTransferDocGenerated),
        };
      }),
    );
    return NextResponse.json({ ok: true, rows: withStatus });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'invoice budget-rows failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בטעינת תקני חשבונית.' }, { status: 500 });
  }
}
