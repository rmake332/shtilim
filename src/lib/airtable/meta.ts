import 'server-only';
import { BASE_ID } from './schema';
import { logger } from '@/lib/logger';
import { CACHE_TAGS } from '@/lib/cacheTags';

/**
 * Airtable Meta API helpers. Read-only schema access — used to pull select-field
 * choices live, so lists in the UI follow Airtable without code changes.
 */

interface MetaTable {
  id: string;
  fields: Array<{
    id: string;
    name: string;
    type: string;
    options?: { choices?: Array<{ name: string }> };
  }>;
}

/** The base schema from the Meta API. Cached for a minute, same as the choices below. */
async function fetchMetaTables(requestId?: string): Promise<MetaTable[]> {
  const airtableToken = process.env.AIRTABLE_TOKEN;
  if (!airtableToken) throw new Error('AIRTABLE_TOKEN not set');

  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${airtableToken}` },
    next: { revalidate: 60, tags: [CACHE_TAGS.fieldChoices] },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error({ requestId, status: res.status }, 'meta api error');
    throw new Error(`Airtable Meta ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { tables: MetaTable[] };
  return json.tables;
}

/**
 * The choice names of a singleSelect / multipleSelects field, in Airtable's order.
 * Returns [] when the table/field isn't found. Cached for a minute only — edits to a
 * select's choices in Airtable must show up in the form almost immediately.
 */
export async function getFieldChoices(
  tableId: string,
  fieldId: string,
  requestId?: string,
): Promise<string[]> {
  const tables = await fetchMetaTables(requestId);
  const table = tables.find((t) => t.id === tableId);
  const field = table?.fields.find((f) => f.id === fieldId);
  return (field?.options?.choices ?? []).map((c) => c.name);
}

/**
 * שדות הקבצים (multipleAttachments) של טבלה, לפי שם.
 *
 * משמש את המיפוי הדינמי של מסמכי ההסמכה: שם הבחירה בשדה "מסמכים נדרשים"
 * בטבלת תת-תפקידים חייב להיות זהה לשם שדה הקובץ ברשימת עובדים, וכך אפשר
 * להוסיף סוג מסמך חדש בלי שינוי קוד. ראו src/lib/subRoleTable.ts.
 */
export async function getAttachmentFields(
  tableId: string,
  requestId?: string,
): Promise<Array<{ id: string; name: string }>> {
  const tables = await fetchMetaTables(requestId);
  const table = tables.find((t) => t.id === tableId);
  return (table?.fields ?? [])
    .filter((f) => f.type === 'multipleAttachments')
    .map((f) => ({ id: f.id, name: f.name }));
}
