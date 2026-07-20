import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { TABLES } from '@/lib/airtable/schema';
import { getFieldChoices } from '@/lib/airtable/meta';
import { logger } from '@/lib/logger';

/**
 * GET /api/field-choices?token=...&fieldId=...
 * Returns the singleSelect/multipleSelect choices for a given field from the
 * Airtable Meta API. Choices are fetched live so any changes in Airtable are
 * reflected immediately without code changes.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const fieldId = req.nextUrl.searchParams.get('fieldId') ?? '';
  const tableId = req.nextUrl.searchParams.get('tableId') ?? TABLES.activePositions;

  if (!fieldId) {
    return NextResponse.json({ error: 'fieldId required' }, { status: 400 });
  }

  try {
    const choices = await getFieldChoices(tableId, fieldId, gate.requestId);
    return NextResponse.json({ choices });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'field-choices failed');
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }
}
