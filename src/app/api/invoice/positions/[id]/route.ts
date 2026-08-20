import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { getPosition, updatePosition, deletePosition, setPositionActive } from '@/lib/invoice/positions';
import { checkLiveAnnualAllocation } from '@/lib/invoice/budgetCheck';
import { listReportsForPosition } from '@/lib/invoice/reports';
import { logger } from '@/lib/logger';

async function verifyOwnership(positionId: string, mosadId: string, requestId?: string) {
  const position = await getPosition(positionId, requestId);
  if (!position) return null;
  const row = await fetchInvoiceBudgetRow(mosadId, position.budgetRowId, requestId);
  return row ? position : null;
}

/**
 * PATCH /api/invoice/positions/[id] - עריכת שעות מוקצות/תעריף/תת-תפקיד להקצאה קיימת,
 * במהלך "ניהול תקציב". בודק חי מול המכסה, תוך החרגת ההקצאה הנוכחית מעצמה. עם
 * `active` בגוף הבקשה - מסמן לא פעיל/פעיל מחדש (ראו setPositionActive), ומדלג על
 * שאר הלוגיקה.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { subRole, allocatedHours, agreedHourlyRate, active } = body as {
    subRole?: string;
    allocatedHours?: number;
    agreedHourlyRate?: number;
    active?: boolean;
  };

  try {
    const position = await verifyOwnership(params.id, gate.institution.mosadId, gate.requestId);
    if (!position) return NextResponse.json({ ok: false, message: 'הקצאה לא נמצאה.' }, { status: 404 });

    if (typeof active === 'boolean') {
      const updated = await setPositionActive(params.id, active, gate.requestId);
      return NextResponse.json({ ok: true, position: updated });
    }

    if (position.inactive) {
      return NextResponse.json(
        { ok: false, message: 'לא ניתן לערוך הקצאה של עובד לא פעיל. יש להפעיל אותו מחדש תחילה.' },
        { status: 409 },
      );
    }

    const nextHours = Number.isFinite(allocatedHours) ? (allocatedHours as number) : position.allocatedHours;
    const nextRate = Number.isFinite(agreedHourlyRate) ? (agreedHourlyRate as number) : position.agreedHourlyRate;
    if (nextHours <= 0 || nextRate <= 0) {
      return NextResponse.json({ ok: false, message: 'שעות ותעריף חייבים להיות גדולים מ-0.' }, { status: 400 });
    }

    const check = await checkLiveAnnualAllocation(
      {
        budgetRowId: position.budgetRowId,
        allocatedHours: nextHours,
        agreedHourlyRate: nextRate,
        excludePositionId: position.id,
      },
      gate.requestId,
    );
    if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: 409 });

    const updated = await updatePosition(
      params.id,
      { subRole, allocatedHours: nextHours, agreedHourlyRate: nextRate },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, position: updated });
  } catch (e) {
    logger.error({ requestId: gate.requestId, positionId: params.id, err: String(e) }, 'invoice position update failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בעדכון ההקצאה.' }, { status: 500 });
  }
}

/**
 * DELETE /api/invoice/positions/[id] - הסרת עובד מהתקן. חסום כשקיימים דיווחים
 * חודשיים מקושרים (למניעת אובדן היסטוריית דיווח), בהתאם להנחה המתועדת בתוכנית.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  try {
    const position = await verifyOwnership(params.id, gate.institution.mosadId, gate.requestId);
    if (!position) return NextResponse.json({ ok: false, message: 'הקצאה לא נמצאה.' }, { status: 404 });

    const reports = await listReportsForPosition(params.id, gate.requestId);
    if (reports.length > 0) {
      return NextResponse.json(
        { ok: false, message: 'לא ניתן להסיר עובד שכבר יש לו דיווחים חודשיים.' },
        { status: 409 },
      );
    }

    await deletePosition(params.id, gate.requestId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, positionId: params.id, err: String(e) }, 'invoice position delete failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בהסרת ההקצאה.' }, { status: 500 });
  }
}
