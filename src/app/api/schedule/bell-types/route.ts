import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { TABLES, BELL_FIELDS } from '@/lib/airtable/schema';
import { getFieldChoices } from '@/lib/airtable/meta';
import { logger } from '@/lib/logger';

/**
 * GET /api/schedule/bell-types?token=...
 * The list of existing bell schedules (סוג choices on לוח צלצולים), read live from
 * Airtable so schedules added later show up without a code change. Used when a
 * teaching role carries no לוח צלצולים and the user has to pick one.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  try {
    const types = await getFieldChoices(TABLES.bellSchedule, BELL_FIELDS.type, gate.requestId);
    return NextResponse.json({ types });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'bell types failed');
    return NextResponse.json({ error: 'bell_types_failed' }, { status: 500 });
  }
}
