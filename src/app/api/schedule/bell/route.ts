import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRoles, getRoleById } from '@/lib/roles';
import { getBellSlots } from '@/lib/schedule/bell';
import { logger } from '@/lib/logger';

/**
 * GET /api/schedule/bell?token=...&symbolId=...&roleId=...
 * Returns the bell-schedule slots available for the chosen role, filtered to the
 * role's לוח צלצולים (סוג). Empty list when the role has no bell schedule.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const symbolId = req.nextUrl.searchParams.get('symbolId') ?? '';
  const roleId = req.nextUrl.searchParams.get('roleId') ?? '';
  if (!roleId) return NextResponse.json({ slots: [] });

  try {
    // Resolve the role server-side so the bell-schedule filter is authoritative.
    // In edit mode the position has no symbol link, so symbolId is empty — fall back
    // to resolving the role by its budget id alone (still scoped to the institution).
    let role = null;
    if (symbolId) {
      const roles = await getRoles(gate.institution.mosadId, symbolId, gate.institution.name);
      role = roles.find((r) => r.id === roleId) ?? null;
    }
    if (!role) {
      role = await getRoleById(gate.institution.mosadId, roleId, gate.institution.name);
    }
    if (!role) return NextResponse.json({ slots: [] });

    const slots = await getBellSlots(role.bellScheduleNums, gate.requestId);
    return NextResponse.json({ slots });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'bell slots failed');
    return NextResponse.json({ error: 'bell_failed' }, { status: 500 });
  }
}
