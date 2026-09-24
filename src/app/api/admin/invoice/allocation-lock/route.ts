import { NextRequest, NextResponse } from 'next/server';
import { gateAdmin } from '@/lib/adminAuth';
import { fetchAllInvoiceBudgetRows, setAllocationLocked } from '@/lib/invoice/budget';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/invoice/allocation-lock { mosadId | budgetRowId, locked } - פתיחה
 * (locked=false) או נעילה מחדש של עריכת ההקצאה השנתית: לכל תקני החשבונית של מוסד,
 * או לתקן בודד.
 */
export async function POST(req: NextRequest) {
  const gate = gateAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const { mosadId, budgetRowId, locked } = body as { mosadId?: string; budgetRowId?: string; locked?: boolean };
  if (typeof locked !== 'boolean' || (!mosadId && !budgetRowId)) {
    return NextResponse.json({ ok: false, message: 'חסרים נתונים.' }, { status: 400 });
  }

  try {
    const all = await fetchAllInvoiceBudgetRows(gate.requestId);
    const targets = all.filter((r) => (budgetRowId ? r.id === budgetRowId : r.mosadId === mosadId));
    if (!targets.length) return NextResponse.json({ ok: false, message: 'לא נמצאו תקני חשבונית.' }, { status: 404 });
    for (const r of targets) {
      if (r.allocationLocked !== locked) await setAllocationLocked(r.id, locked, gate.requestId);
    }
    logger.info({ requestId: gate.requestId, mosadId, budgetRowId, locked, count: targets.length }, 'admin allocation lock changed');
    return NextResponse.json({ ok: true, count: targets.length });
  } catch (e) {
    logger.error({ requestId: gate.requestId, mosadId, budgetRowId, err: String(e) }, 'admin allocation lock failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בעדכון הנעילה.' }, { status: 500 });
  }
}
