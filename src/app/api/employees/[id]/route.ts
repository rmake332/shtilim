import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getEmployeeById } from '@/lib/employees';
import { logger } from '@/lib/logger';

/**
 * GET /api/employees/[id]?token=...
 * Full employee details for the editable detail form (returned only after explicit selection).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;
  try {
    const employee = await getEmployeeById(params.id, gate.requestId);
    if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ employee });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'get employee failed');
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
