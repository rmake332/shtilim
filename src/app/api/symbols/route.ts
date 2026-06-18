import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getSymbolsForInstitution } from '@/lib/symbols';
import { logger } from '@/lib/logger';

/** GET /api/symbols?token=... — institution symbols for the dropdown. */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;
  try {
    const symbols = await getSymbolsForInstitution(gate.institution.mosadId);
    return NextResponse.json({ symbols });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'symbols failed');
    return NextResponse.json({ error: 'symbols_failed' }, { status: 500 });
  }
}
