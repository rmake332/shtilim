import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { findSameInstitutionDays } from '@/lib/sameInstitutionDays';

/**
 * GET /api/schedule/same-institution-days?token=&tz=&excludePositionId=
 *
 * מחזיר את הימים שבהם לעובד כבר יש תקן פעיל אחר במוסד הנוכחי (המוסד נגזר
 * מהטוקן). בהזנה בסגנון פרא מדלגים ביום כזה על ניכוי ה-35/40 לגמרי, והשעות
 * האקדמיות מחושבות ישירות דקות ÷ 45. תקן במוסד אחר אינו נספר כאן.
 *
 *   { ok: true, days: { sun: [{ positionId, positionName, shifts }], ... } }
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const tz = req.nextUrl.searchParams.get('tz') ?? '';
  if (!tz) return NextResponse.json({ error: 'missing_tz' }, { status: 400 });
  const excludePositionId = req.nextUrl.searchParams.get('excludePositionId') ?? undefined;

  try {
    const days = await findSameInstitutionDays(
      { tz, mosadId: gate.institution.mosadId, excludePositionId },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, days });
  } catch {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
