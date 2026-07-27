import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { checkWeeklyTotal } from '@/lib/weeklyTotalCheck';

/**
 * GET /api/schedule/weekly-total?token=&tz=&hours=&layer=&excludePositionId=
 *
 * תקרת 42 שעות שבועיות לעובד - סה"כ תקניו לפי ת.ז., רק במוסדות של עמותת המוסד
 * הנוכחי. `hours` הן השעות השבועיות של התקן שמוזן עכשיו. מוחרגים עובדי פנימייה
 * ועובדים שמסומן להם "העסקה 12 שעות".
 *
 * העמותה נגזרת מהטוקן ואינה נקראת מה-query - אחרת אפשר היה להרחיב את היקף
 * הבדיקה מהלקוח.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = req.nextUrl;
  const tz = searchParams.get('tz') ?? '';
  if (!tz) return NextResponse.json({ error: 'missing_tz' }, { status: 400 });

  const newHours = Number(searchParams.get('hours') ?? '0');
  const layer = searchParams.get('layer') ?? '';
  const excludePositionId = searchParams.get('excludePositionId') ?? undefined;

  try {
    const result = await checkWeeklyTotal(
      {
        tz,
        newHours: Number.isFinite(newHours) ? newHours : 0,
        layer,
        association: gate.institution.association ?? '',
        excludePositionId,
      },
      gate.requestId,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
