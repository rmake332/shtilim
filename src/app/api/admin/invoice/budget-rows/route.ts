import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { gateAdmin } from '@/lib/adminAuth';
import { CACHE_TAGS } from '@/lib/cacheTags';
import { createInvoiceBudgetRow, fetchAllInvoiceBudgetRows } from '@/lib/invoice/budget';
import { parseBudgetRowInput } from '@/lib/invoice/budgetRowInput';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/invoice/budget-rows - שורת תקציב חשבונית חדשה (ממשק מנהל). לכל
 * מוסד תפקיד אחד בלבד בקטגוריית חשבונית - יצירה שנייה לאותו מוסד נחסמת (409).
 */
export async function POST(req: NextRequest) {
  const gate = gateAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  try {
    const input = await parseBudgetRowInput(body, gate.requestId);
    if (typeof input === 'string') return NextResponse.json({ ok: false, message: input }, { status: 400 });
    const existing = await fetchAllInvoiceBudgetRows(gate.requestId);
    if (existing.some((r) => r.mosadId === input.mosadId)) {
      return NextResponse.json(
        { ok: false, message: 'למוסד זה כבר יש תפקיד בקטגוריית חשבונית. יש לערוך את השורה הקיימת.' },
        { status: 409 },
      );
    }
    const id = await createInvoiceBudgetRow(input, gate.requestId);
    revalidateTag(CACHE_TAGS.budget);
    logger.info({ requestId: gate.requestId, budgetRowId: id, mosadId: input.mosadId }, 'admin invoice budget row created');
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'admin invoice budget row create failed');
    return NextResponse.json({ ok: false, message: 'שגיאה ביצירת שורת התקציב.' }, { status: 500 });
  }
}
