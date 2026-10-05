import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { gateAdmin } from '@/lib/adminAuth';
import { CACHE_TAGS } from '@/lib/cacheTags';
import { fetchAllInvoiceBudgetRows, updateInvoiceBudgetRow, deleteInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow } from '@/lib/invoice/positions';
import { formatNum } from '@/lib/formatNum';
import { logger } from '@/lib/logger';
import { parseBudgetRowInput } from '@/lib/invoice/budgetRowInput';

/** רק שורות בקטגוריית חשבונית - הממשק לא נוגע בשאר טבלת התקציב. */
async function findInvoiceRow(id: string, requestId: string) {
  const rows = await fetchAllInvoiceBudgetRows(requestId);
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * PATCH /api/admin/invoice/budget-rows/[id] - עריכת שורת תקציב חשבונית. חסום להעביר
 * למוסד אחר כשיש עובדים מוקצים (הם שייכים למוסד הנוכחי), ולהוריד את המכסה השבועית
 * מתחת לסה"כ השעות שכבר הוקצו.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = gateAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  try {
    const row = await findInvoiceRow(params.id, gate.requestId);
    if (!row) return NextResponse.json({ ok: false, message: 'שורת תקציב חשבונית לא נמצאה.' }, { status: 404 });

    const input = await parseBudgetRowInput(body, gate.requestId);
    if (typeof input === 'string') return NextResponse.json({ ok: false, message: input }, { status: 400 });

    const positions = await listPositionsForBudgetRow(row.id, gate.requestId);
    if (positions.length > 0 && input.mosadId !== row.mosadId) {
      return NextResponse.json(
        { ok: false, message: 'לא ניתן להעביר למוסד אחר תקן שכבר יש בו עובדים מוקצים.' },
        { status: 409 },
      );
    }
    const allocated = positions.reduce((s, p) => s + p.allocatedHours, 0);
    if (input.weeklyHoursQuota < allocated) {
      return NextResponse.json(
        {
          ok: false,
          message: `כבר הוקצו ${formatNum(allocated)} שעות שבועיות בתקן זה - לא ניתן להוריד את המכסה מתחת לכך.`,
        },
        { status: 409 },
      );
    }

    await updateInvoiceBudgetRow(row.id, input, gate.requestId);
    revalidateTag(CACHE_TAGS.budget);
    logger.info({ requestId: gate.requestId, budgetRowId: row.id }, 'admin invoice budget row updated');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'admin invoice budget row update failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בעדכון שורת התקציב.' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/invoice/budget-rows/[id] - מחיקת שורת תקציב חשבונית. חסום כשיש
 * עובדים מוקצים: מחיקה הייתה משאירה הקצאות, דיווחים ויתרות חודשיות יתומים.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = gateAdmin(req);
  if (gate instanceof NextResponse) return gate;

  try {
    const row = await findInvoiceRow(params.id, gate.requestId);
    if (!row) return NextResponse.json({ ok: false, message: 'שורת תקציב חשבונית לא נמצאה.' }, { status: 404 });

    const positions = await listPositionsForBudgetRow(row.id, gate.requestId);
    if (positions.length > 0) {
      return NextResponse.json(
        { ok: false, message: `לא ניתן למחוק: יש בתקן ${positions.length} עובדים מוקצים. יש להסיר אותם תחילה.` },
        { status: 409 },
      );
    }

    await deleteInvoiceBudgetRow(row.id, gate.requestId);
    revalidateTag(CACHE_TAGS.budget);
    logger.info({ requestId: gate.requestId, budgetRowId: row.id, title: row.title }, 'admin invoice budget row deleted');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId: params.id, err: String(e) }, 'admin invoice budget row delete failed');
    return NextResponse.json({ ok: false, message: 'שגיאה במחיקת שורת התקציב.' }, { status: 500 });
  }
}
