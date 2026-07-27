import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { checkWeeklyTotal } from '@/lib/weeklyTotalCheck';

/**
 * GET /api/schedule/weekly-total?token=&tz=&hours=&layer=&excludePositionId=
 *
 * תקרת 42 שעות שבועיות לעובד - סה"כ כל תקניו לפי ת.ז. `hours` הן השעות
 * השבועיות של התקן שמוזן עכשיו. מוחרגים עובדי פנימייה ועובדים שמסומן להם
 * "העסקה 12 שעות".
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
      { tz, newHours: Number.isFinite(newHours) ? newHours : 0, layer, excludePositionId },
      gate.requestId,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
