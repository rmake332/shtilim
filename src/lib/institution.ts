import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, MOSAD_FIELDS } from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';

/**
 * Resolve an institution from its opaque form token (server-side only).
 * The mosadId is DERIVED from the token here — never accepted from the client (IDOR protection).
 *
 * Token management uses fields added to the מוסדות table:
 *   form_token, form_pin_hash, form_active
 */

export interface Institution {
  mosadId: string;
  name: string;
  responsible?: string;
  association?: string;
  /** שכבה מהמוסד — fallback when the selected budget row carries no layer. */
  layer?: string;
}

const FORM_TOKEN_FIELD = 'form_token';
const FORM_ACTIVE_FIELD = 'form_active';

export async function resolveInstitutionByToken(
  token: string,
  requestId?: string,
): Promise<Institution | null> {
  // Dev bypass: in mock mode the token "dev" yields a fake institution (no real PAT/token needed).
  // layer 'גנים' so the violence-cert document path is exercisable in mock.
  if (process.env.AIRTABLE_MOCK === '1' && token === 'dev') {
    return { mosadId: 'recDEV', name: 'שתילים ירושלים (DEV)', association: 'שתילים רשת חינוך', layer: 'גנים' };
  }

  if (!token || token.length < 12) return null;

  const safe = escapeFormulaValue(token);
  const formula = `AND({${FORM_TOKEN_FIELD}}="${safe}", {${FORM_ACTIVE_FIELD}}=TRUE())`;

  let records;
  try {
    records = await listRecords(TABLES.mosadot, { filterByFormula: formula, maxRecords: 1 }, requestId);
  } catch (e) {
    logger.error({ requestId, err: String(e) }, 'institution token resolution failed');
    return null;
  }

  const rec = records[0];
  if (!rec) {
    logger.warn({ requestId }, 'no institution for token');
    return null;
  }

  // Records come back keyed by field ID (client sets returnFieldsByFieldId=true),
  // so read by ID — reading by Hebrew name yields undefined.
  const f = rec.fields;
  const layerRaw = f[MOSAD_FIELDS.layer];
  const layer = layerRaw && typeof layerRaw === 'object' && 'name' in (layerRaw as object)
    ? String((layerRaw as { name: string }).name)
    : layerRaw ? String(layerRaw) : undefined;

  return {
    mosadId: rec.id,
    name: String(f[MOSAD_FIELDS.name] ?? ''),
    responsible: f[MOSAD_FIELDS.responsible] ? String(f[MOSAD_FIELDS.responsible]) : undefined,
    association: f[MOSAD_FIELDS.association] ? String(f[MOSAD_FIELDS.association]) : undefined,
    layer,
  };
}
