import 'server-only';
import { logger } from '@/lib/logger';
import { BASE_ID } from './schema';
import { getMock } from './mock';

/**
 * Server-side Airtable REST wrapper. PAT lives in env only (never client-side).
 * Logs endpoint/status/duration (no PII values). Retries on 429 with backoff.
 * AIRTABLE_MOCK=1 → serves local fixtures.
 */

const API_BASE = 'https://api.airtable.com/v0';
/** Attachment uploads use the content host, not api.airtable.com. */
const CONTENT_BASE = 'https://content.airtable.com/v0';

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

const MOCK = process.env.AIRTABLE_MOCK === '1';

function token(): string {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error('AIRTABLE_TOKEN is not set (server env).');
  return t;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  requestId?: string,
): Promise<unknown> {
  const url = `${API_BASE}/${BASE_ID}/${path}`;
  const started = Date.now();
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    if (res.status === 429 && attempt < maxRetries) {
      const wait = 250 * 2 ** attempt;
      logger.warn({ requestId, path, attempt }, 'airtable 429 — backing off');
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    const ms = Date.now() - started;
    logger.info({ requestId, method, path, status: res.status, ms }, 'airtable request');

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ requestId, path, status: res.status }, 'airtable error');
      throw new Error(`Airtable ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }
  throw new Error('Airtable: exhausted retries');
}

/** List/query records of a table. Filtering is done via Airtable filterByFormula (escaped by caller). */
export async function listRecords(
  tableId: string,
  opts: { filterByFormula?: string; maxRecords?: number; fields?: string[] } = {},
  requestId?: string,
): Promise<AirtableRecord[]> {
  if (MOCK) return getMock(tableId, opts);

  // Airtable returns at most 100 records per page and signals more via `offset`.
  // Follow the cursor so callers reliably get the full set (the budget table alone
  // has >1400 rows); maxRecords, if given, caps the total returned.
  const all: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    // All callers address fields by field ID (see schema.ts), so responses must be
    // keyed by field ID and any fields[] filter is interpreted as IDs, not names.
    params.set('returnFieldsByFieldId', 'true');
    params.set('pageSize', '100');
    if (opts.filterByFormula) params.set('filterByFormula', opts.filterByFormula);
    if (opts.maxRecords) params.set('maxRecords', String(opts.maxRecords));
    (opts.fields || []).forEach((f) => params.append('fields[]', f));
    if (offset) params.set('offset', offset);

    const json = (await request('GET', `${tableId}?${params.toString()}`, undefined, requestId)) as {
      records: AirtableRecord[];
      offset?: string;
    };
    all.push(...json.records);
    offset = json.offset;
  } while (offset && (!opts.maxRecords || all.length < opts.maxRecords));

  return opts.maxRecords ? all.slice(0, opts.maxRecords) : all;
}

/** Fetch a single record by id (fields keyed by field ID). Returns null in mock mode. */
export async function getRecord(
  tableId: string,
  recordId: string,
  requestId?: string,
): Promise<AirtableRecord | null> {
  if (MOCK) return null;
  const json = (await request(
    'GET',
    `${tableId}/${recordId}?returnFieldsByFieldId=true`,
    undefined,
    requestId,
  )) as AirtableRecord;
  return json;
}

export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>,
  requestId?: string,
): Promise<AirtableRecord> {
  if (MOCK) {
    logger.info({ requestId, tableId }, 'mock create');
    return { id: `recMOCK${Date.now()}`, fields };
  }
  const json = (await request('POST', tableId, { fields, typecast: true }, requestId)) as AirtableRecord;
  return json;
}

export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
  requestId?: string,
): Promise<AirtableRecord> {
  if (MOCK) {
    logger.info({ requestId, tableId, recordId }, 'mock update');
    return { id: recordId, fields };
  }
  const json = (await request(
    'PATCH',
    `${tableId}/${recordId}`,
    { fields, typecast: true },
    requestId,
  )) as AirtableRecord;
  return json;
}

export async function deleteRecord(
  tableId: string,
  recordId: string,
  requestId?: string,
): Promise<void> {
  if (MOCK) {
    logger.info({ requestId, tableId, recordId }, 'mock delete');
    return;
  }
  await request('DELETE', `${tableId}/${recordId}`, undefined, requestId);
}

/**
 * Upload a single file to a multipleAttachments field of an existing record via the
 * Airtable upload-attachment endpoint (base64 payload; no public hosting needed).
 * Caps at ~5MB per Airtable's limit. No-op in mock mode.
 */
export async function uploadAttachment(
  recordId: string,
  fieldId: string,
  file: { filename: string; contentType: string; base64: string },
  requestId?: string,
): Promise<void> {
  if (MOCK) {
    logger.info({ requestId, recordId, fieldId, filename: file.filename }, 'mock upload attachment');
    return;
  }
  const url = `${CONTENT_BASE}/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`;
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: file.contentType,
      file: file.base64,
      filename: file.filename,
    }),
    cache: 'no-store',
  });
  const ms = Date.now() - started;
  logger.info({ requestId, recordId, fieldId, status: res.status, ms }, 'airtable upload attachment');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error({ requestId, fieldId, status: res.status }, 'airtable upload attachment error');
    throw new Error(`Airtable upload ${res.status}: ${text.slice(0, 300)}`);
  }
}

/** Escape a value for safe inclusion inside an Airtable formula string literal. */
export function escapeFormulaValue(v: string): string {
  // Within "..." literals, escape double-quotes and backslashes.
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
