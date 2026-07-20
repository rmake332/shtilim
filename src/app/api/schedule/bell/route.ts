import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRoles, getRoleById } from '@/lib/roles';
import { getBellSlots } from '@/lib/schedule/bell';
import { logger } from '@/lib/logger';

/**
 * GET /api/schedule/bell?token=...&symbolId=...&roleId=...[&type=...]
 * Returns the bell-schedule slots to enter the timetable by, always from a SINGLE
 * לוח צלצולים (סוג). Which one depends on the role (resolved server-side, so the
 * client can't widen it):
 *  - role offers exactly one   → that one, `type` ignored
 *  - role offers several       → `type`, but only if it's one of the role's own
 *  - role offers none          → any `type` the user picked from /api/schedule/bell-types
 * No (valid) choice yet → empty list; the UI shows its schedule picker until then.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const symbolId = req.nextUrl.searchParams.get('symbolId') ?? '';
  const roleId = req.nextUrl.searchParams.get('roleId') ?? '';
  const chosenType = req.nextUrl.searchParams.get('type') ?? '';
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

    const roleTypes = role.bellScheduleNums;
    let types: string[];
    if (roleTypes.length === 1) types = roleTypes;
    else if (roleTypes.length > 1) types = roleTypes.includes(chosenType) ? [chosenType] : [];
    else types = chosenType ? [chosenType] : [];

    const slots = await getBellSlots(types, gate.requestId);
    return NextResponse.json({ slots });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'bell slots failed');
    return NextResponse.json({ error: 'bell_failed' }, { status: 500 });
  }
}
