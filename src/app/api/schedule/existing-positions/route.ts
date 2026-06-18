import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { sumExistingPositions } from '@/lib/existingPositions';

/**
 * GET /api/schedule/existing-positions?token=&tz=&category=&layer=
 *
 * Returns how many active positions the employee already has in the same
 * category + layer, plus their hour breakdown. Used as step 2 of the three-step
 * ofek check flow (between the single-role check and the combined check).
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = req.nextUrl;
  const tz = searchParams.get('tz') ?? '';
  const category = searchParams.get('category') ?? '';
  const layer = searchParams.get('layer') ?? '';
  const excludePositionId = searchParams.get('excludePositionId') ?? undefined;

  if (!tz) return NextResponse.json({ error: 'missing_tz' }, { status: 400 });

  try {
    const result = await sumExistingPositions({ tz, category, layer, excludePositionId }, gate.requestId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
