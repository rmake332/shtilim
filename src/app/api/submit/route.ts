import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { submitForm } from '@/lib/submit';
import { isValidIsraeliId } from '@/lib/validation/israeliId';
import { notifySubmitWebhook, notifyError } from '@/lib/makeWebhook';
import { checkWeeklyTotal } from '@/lib/weeklyTotalCheck';
import { logger } from '@/lib/logger';

/**
 * POST /api/submit — final submission. Token-gated (mosadId derived server-side).
 * Re-validates server-side, then writes ONE תקנים פעילים record (+ employee if new).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { employee, role, schedule, consent } = body;

  if (!consent) {
    return NextResponse.json({ ok: false, message: 'נדרש אישור הצהרת פרטיות.' }, { status: 400 });
  }
  if (!employee || !role || !schedule) {
    return NextResponse.json({ ok: false, message: 'חסרים נתונים.' }, { status: 400 });
  }
  // Re-validate ID server-side for new employees.
  if (!employee.recordId && !isValidIsraeliId(employee.tz ?? '')) {
    return NextResponse.json({ ok: false, message: 'ת.ז. לא תקינה.' }, { status: 400 });
  }
  if (!role.roleId) {
    return NextResponse.json({ ok: false, message: 'לא נבחר תפקיד.' }, { status: 400 });
  }

  // תקרת 42 ש"ש לעובד בכל תקניו - נאכפת גם כאן ולא רק בטופס, כדי שלא ניתן לעקוף אותה.
  try {
    const weeklyTotal = await checkWeeklyTotal(
      { tz: employee.tz ?? '', newHours: Number(schedule.weeklyHours) || 0, layer: role.layer ?? '' },
      gate.requestId,
    );
    if (!weeklyTotal.ok) {
      logger.info({ requestId: gate.requestId, total: weeklyTotal.total }, 'submit blocked - weekly cap');
      return NextResponse.json({ ok: false, message: weeklyTotal.message }, { status: 400 });
    }
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'weekly cap check failed');
    return NextResponse.json(
      { ok: false, message: 'שגיאה בבדיקת סה"כ השעות השבועיות של העובד. נסו שוב.' },
      { status: 503 },
    );
  }

  try {
    const out = await submitForm(
      { institutionMosadId: gate.institution.mosadId, employee, role, schedule },
      gate.requestId,
    );
    await notifySubmitWebhook(
      {
        tz: employee.tz,
        association: gate.institution.association,
        name: employee.name,
        role: role.roleTitle,
        institution: gate.institution.name,
      },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'submit failed');
    await notifyError(
      {
        stage: 'airtable_write',
        name: employee.name,
        tz: employee.tz,
        role: role.roleTitle,
        institution: gate.institution.name,
        detail: String(e),
      },
      gate.requestId,
    );
    return NextResponse.json({ ok: false, message: 'שגיאה בשמירת הטופס.' }, { status: 500 });
  }
}
