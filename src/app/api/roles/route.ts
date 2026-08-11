import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRoles, getRoleById, getExtraLines } from '@/lib/roles';
import { logger } from '@/lib/logger';

/**
 * GET /api/roles?token=...&symbolId=...        → main roles for institution+symbol
 * GET /api/roles?token=...&roleId=...           → single role by budget-row id, no symbol
 *   needed (edit mode: the position may not carry a symbol link — see getRoleById).
 * GET /api/roles?token=...&extra=gemul|roles   → extra budget lines (remaining > 0)
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const symbolId = req.nextUrl.searchParams.get('symbolId') ?? '';
  const roleId = req.nextUrl.searchParams.get('roleId') ?? '';
  const extra = req.nextUrl.searchParams.get('extra');

  try {
    if (extra === 'gemul' || extra === 'roles') {
      const lines = await getExtraLines(gate.institution.mosadId, extra, gate.institution.name);
      return NextResponse.json({ lines });
    }
    if (roleId) {
      const role = await getRoleById(gate.institution.mosadId, roleId, gate.institution.name);
      return NextResponse.json({ roles: role ? [role] : [] });
    }
    if (!symbolId) return NextResponse.json({ roles: [] });
    const roles = await getRoles(gate.institution.mosadId, symbolId, gate.institution.name);
    return NextResponse.json({ roles });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'roles failed');
    return NextResponse.json({ error: 'roles_failed' }, { status: 500 });
  }
}
