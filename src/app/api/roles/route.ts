import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRoles, getExtraLines } from '@/lib/roles';
import { logger } from '@/lib/logger';

/**
 * GET /api/roles?token=...&symbolId=...        → main roles for institution+symbol
 * GET /api/roles?token=...&extra=gemul|roles   → extra budget lines (remaining > 0)
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const symbolId = req.nextUrl.searchParams.get('symbolId') ?? '';
  const extra = req.nextUrl.searchParams.get('extra');

  try {
    if (extra === 'gemul' || extra === 'roles') {
      const lines = await getExtraLines(gate.institution.mosadId, extra);
      return NextResponse.json({ lines });
    }
    if (!symbolId) return NextResponse.json({ roles: [] });
    const roles = await getRoles(gate.institution.mosadId, symbolId);
    return NextResponse.json({ roles });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'roles failed');
    return NextResponse.json({ error: 'roles_failed' }, { status: 500 });
  }
}
