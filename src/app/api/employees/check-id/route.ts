import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { findEmployeeByExactId } from '@/lib/employees';
import { logger } from '@/lib/logger';

/**
 * GET /api/employees/check-id?tz=...&token=...
 * Returns { exists, employee? }. Used to block duplicate creation and auto-select
 * the existing employee when a known ת.ז. is entered in the "new employee" form.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const tz = req.nextUrl.searchParams.get('tz') ?? '';
  try {
    const employee = await findEmployeeByExactId(tz, gate.requestId);
    return NextResponse.json({ exists: Boolean(employee), employee });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'check-id failed');
    return NextResponse.json({ error: 'check_failed' }, { status: 500 });
  }
}
