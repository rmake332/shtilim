import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getPrevYearPosition } from '@/lib/prevYearPosition';
import { logger } from '@/lib/logger';

/**
 * GET /api/prev-year-position?token=...&tz=...&roleTitle=...&category=...&mosadName=...
 * Returns prior-year (תשפ"ו) schedule data for the same employee + role if found.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const p = req.nextUrl.searchParams;
  const tz = p.get('tz') ?? '';
  const roleTitle = p.get('roleTitle') ?? '';
  const category = p.get('category') ?? '';
  const mosadName = p.get('mosadName') ?? '';

  if (!tz || !roleTitle || !category || !mosadName) {
    return NextResponse.json({ found: false });
  }

  try {
    const result = await getPrevYearPosition(tz, roleTitle, category, mosadName, gate.requestId);
    if (!result) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, ...result });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'prev-year-position failed');
    return NextResponse.json({ error: 'prev_year_failed' }, { status: 500 });
  }
}
