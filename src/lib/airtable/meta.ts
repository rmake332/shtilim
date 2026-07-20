import 'server-only';
import { BASE_ID } from './schema';
import { logger } from '@/lib/logger';

/**
 * Airtable Meta API helpers. Read-only schema access — used to pull select-field
 * choices live, so lists in the UI follow Airtable without code changes.
 */

/**
 * The choice names of a singleSelect / multipleSelects field, in Airtable's order.
 * Returns [] when the table/field isn't found. Cached for an hour (schema rarely changes).
 */
export async function getFieldChoices(
  tableId: string,
  fieldId: string,
  requestId?: string,
): Promise<string[]> {
  const airtableToken = process.env.AIRTABLE_TOKEN;
  if (!airtableToken) throw new Error('AIRTABLE_TOKEN not set');

  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${airtableToken}` },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error({ requestId, status: res.status }, 'meta api error');
    throw new Error(`Airtable Meta ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    tables: Array<{
      id: string;
      fields: Array<{ id: string; type: string; options?: { choices?: Array<{ name: string }> } }>;
    }>;
  };

  const table = json.tables.find((t) => t.id === tableId);
  const field = table?.fields.find((f) => f.id === fieldId);
  return (field?.options?.choices ?? []).map((c) => c.name);
}
