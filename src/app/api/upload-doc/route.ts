import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRecord, uploadAttachment, escapeFormulaValue, listRecords } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, DOC_FIELDS } from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';

/**
 * Field IDs that may receive an upload — restricted to the position-scoped document
 * fields defined in DOC_FIELDS (currently only נתוני העסקה; the youth/role documents
 * are filed on the employee via /api/upload-employee-doc instead).
 */
const ALLOWED_FIELD_IDS = new Set<string>(
  DOC_FIELDS.filter((d) => d.key === 'docEmployment').map((d) => d.fieldId),
);
/** Server-side cap mirroring the client (Airtable upload-attachment limit ~5MB). */
const MAX_DOC_BYTES = 5 * 1024 * 1024;

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

/**
 * Verify the position record belongs to the gated institution (IDOR guard).
 * Path: position.roleLink → תקציב התחלתי → its mosadID lookup includes mosadId.
 */
async function positionBelongsToInstitution(
  positionId: string,
  mosadId: string,
  requestId?: string,
): Promise<boolean> {
  const position = await getRecord(TABLES.activePositions, positionId, requestId);
  if (!position) return false;
  const budgetId = recordLinks(position.fields[POSITION_FIELDS.roleLink])[0];
  if (!budgetId) return false;
  // Fetch the institution's budget rows and confirm this budget record is among them.
  const formula = `FIND("${escapeFormulaValue(mosadId)}", ARRAYJOIN({mosadID}))`;
  const budget = await listRecords(TABLES.budget, { filterByFormula: formula }, requestId);
  return budget.some((b) => b.id === budgetId);
}

/**
 * POST /api/upload-doc — upload ONE youth-document attachment to a position record.
 * Token-gated; field id whitelisted; record ownership verified. One file per request
 * keeps the body under the host's request-size limit.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { positionId, fieldId, file } = body as {
    positionId?: string;
    fieldId?: string;
    file?: { filename?: string; contentType?: string; base64?: string };
  };

  if (!positionId || !fieldId || !file?.base64) {
    return NextResponse.json({ ok: false, message: 'חסרים נתוני קובץ.' }, { status: 400 });
  }
  if (!ALLOWED_FIELD_IDS.has(fieldId)) {
    return NextResponse.json({ ok: false, message: 'שדה לא מורשה.' }, { status: 400 });
  }
  // base64 → byte length ≈ len * 3/4; reject oversized payloads early.
  if (Math.floor((file.base64.length * 3) / 4) > MAX_DOC_BYTES) {
    return NextResponse.json({ ok: false, message: 'הקובץ גדול מדי.' }, { status: 413 });
  }

  try {
    // In mock mode there's no real record to verify; skip the ownership check.
    const mock = process.env.AIRTABLE_MOCK === '1';
    const owned = mock || (await positionBelongsToInstitution(positionId, gate.institution.mosadId, gate.requestId));
    if (!owned) {
      logger.warn({ requestId: gate.requestId, positionId }, 'upload rejected: position not owned by institution');
      return NextResponse.json({ ok: false, message: 'אין הרשאה לרשומה זו.' }, { status: 403 });
    }
    await uploadAttachment(
      positionId,
      fieldId,
      {
        filename: file.filename || 'document',
        contentType: file.contentType || 'application/octet-stream',
        base64: file.base64,
      },
      gate.requestId,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, positionId, err: String(e) }, 'upload-doc failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בהעלאת הקובץ.' }, { status: 500 });
  }
}
