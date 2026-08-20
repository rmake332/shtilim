import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, SYSTEM_SETTINGS_FIELDS } from '@/lib/airtable/schema';

/** קורא ערך יחיד מטבלת "הגדרות מערכת" לפי מפתח (ראו SETTINGS_KEYS ב-schema.ts). */
export async function getSystemSetting(key: string, requestId?: string): Promise<string | null> {
  const formula = `{${SYSTEM_SETTINGS_FIELDS.key}}="${escapeFormulaValue(key)}"`;
  const records = await listRecords(TABLES.systemSettings, { filterByFormula: formula, maxRecords: 1 }, requestId);
  const r = records[0];
  if (!r) return null;
  const v = r.fields[SYSTEM_SETTINGS_FIELDS.value];
  return v == null ? null : String(v);
}
