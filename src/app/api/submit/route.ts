import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { submitForm, DuplicateSubmissionError } from '@/lib/submit';
import { isValidIsraeliId } from '@/lib/validation/israeliId';
import { isValidForeignId } from '@/lib/validation/foreignId';
import { notifySubmitWebhook, notifyError } from '@/lib/makeWebhook';
import { checkWeeklyTotal } from '@/lib/weeklyTotalCheck';
import { checkLiveBudget } from '@/lib/schedule/budgetCheck';
import { computeUtilizedHours } from '@/lib/schedule/ofek';
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
  if (!employee.recordId) {
    const tzOk = employee.noIsraeliId
      ? isValidForeignId(employee.tz ?? '')
      : isValidIsraeliId(employee.tz ?? '');
    if (!tzOk) {
      return NextResponse.json(
        { ok: false, message: employee.noIsraeliId ? 'מספר זיהוי לא תקין.' : 'ת.ז. לא תקינה.' },
        { status: 400 },
      );
    }
  }
  if (!role.roleId) {
    return NextResponse.json({ ok: false, message: 'לא נבחר תפקיד.' }, { status: 400 });
  }

  // תקרת 42 ש"ש לעובד בכל תקניו בעמותה - נאכפת גם כאן ולא רק בטופס, כדי שלא ניתן לעקוף אותה.
  try {
    const weeklyTotal = await checkWeeklyTotal(
      {
        tz: employee.tz ?? '',
        newHours: Number(schedule.weeklyHours) || 0,
        layer: role.layer ?? '',
        association: gate.institution.association ?? '',
      },
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

  // חריגה מהתקציב - מול הערך החי באיירטייבל, לא מול ה-snapshot שהלקוח מחזיק
  // (יכול לפגר, ראה docs/airtable-cache-revalidation.md), כדי שתקנים לאותה שורת
  // תקציב שנשלחים בסמיכות לא יחרגו ביחד מבלי שאף בדיקה תתפוס את זה.
  try {
    const budgetCheck = await checkLiveBudget(
      { roleId: role.roleId, utilizedHours: computeUtilizedHours(role.layer, schedule, role.scheduleType) },
      gate.requestId,
    );
    if (!budgetCheck.ok) {
      logger.info(
        { requestId: gate.requestId, remaining: budgetCheck.remaining },
        'submit blocked - over budget (live check)',
      );
      return NextResponse.json({ ok: false, message: budgetCheck.message }, { status: 400 });
    }
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'live budget check failed');
    return NextResponse.json(
      { ok: false, message: 'שגיאה בבדיקת יתרת התקציב. נסו שוב.' },
      { status: 503 },
    );
  }

  try {
    const out = await submitForm(
      {
        institutionMosadId: gate.institution.mosadId,
        institutionName: gate.institution.name,
        employee,
        role,
        schedule,
      },
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
    if (e instanceof DuplicateSubmissionError) {
      const editUrl = `/form/${encodeURIComponent(body.token)}/edit/${e.existingPositionId}`;
      return NextResponse.json({ ok: false, message: e.message, editUrl }, { status: 409 });
    }
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
