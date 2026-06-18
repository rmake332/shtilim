import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { BASE_ID, TABLES } from '@/lib/airtable/schema';
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
    const airtableToken = process.env.AIRTABLE_TOKEN;
    if (!airtableToken) throw new Error('AIRTABLE_TOKEN not set');

    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`,
      {
        headers: { Authorization: `Bearer ${airtableToken}` },
        next: { revalidate: 3600 },
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ requestId: gate.requestId, status: res.status }, 'meta api error');
      throw new Error(`Airtable Meta ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      tables: Array<{
        id: string;
        fields: Array<{
          id: string;
          type: string;
          options?: { choices?: Array<{ name: string }> };
        }>;
      }>;
    };

    const table = json.tables.find((t) => t.id === tableId);
    const field = table?.fields.find((f) => f.id === fieldId);
    const choices = (field?.options?.choices ?? []).map((c) => c.name);

    return NextResponse.json({ choices });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'field-choices failed');
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }
}
