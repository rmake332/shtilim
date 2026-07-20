import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRecord, uploadAttachment, escapeFormulaValue, listRecords } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, EMPLOYEE_FIELDS, DOC_FIELDS } from '@/lib/airtable/schema';
import { getSymbolsForInstitution } from '@/lib/symbols';
import { MAX_DOC_BYTES } from '@/lib/formTypes';
import { logger } from '@/lib/logger';

/**
 * Field IDs that may receive an upload — restricted to the position-scoped document
 * fields defined in DOC_FIELDS (currently only נתוני העסקה; the youth/role documents
 * are filed on the employee via /api/upload-employee-doc instead).
 */
const ALLOWED_FIELD_IDS = new Set<string>(
  DOC_FIELDS.filter((d) => d.key === 'docEmployment').map((d) => d.fieldId),
);
/** Server-side cap mirroring the client (see MAX_DOC_BYTES — bounded by the host body limit). */

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

/**
 * Verify the position record belongs to the gated institution (IDOR guard).
 * Three independent paths are tried, because relying on the budget link alone made a
 * legitimate upload fail with 403 whenever that link was missing (e.g. the תקציב row it
 * pointed at was removed after the position was created):
 *   1. position.roleLink → תקציב התחלתי → its mosadID lookup includes mosadId.
 *   2. position.symbolLink → one of the institution's סמל מוסד records.
 *   3. position.employeeLink → employee's מוסד link includes mosadId.
 * Any match proves the record is the institution's; all three failing means it isn't.
 */
async function positionBelongsToInstitution(
  positionId: string,
  mosadId: string,
  requestId?: string,
): Promise<boolean> {
  const position = await getRecord(TABLES.activePositions, positionId, requestId);
  if (!position) return false;

  // 1. budget row → mosadID lookup
  const budgetId = recordLinks(position.fields[POSITION_FIELDS.roleLink])[0];
  if (budgetId) {
    const formula = `FIND("${escapeFormulaValue(mosadId)}", ARRAYJOIN({mosadID}))`;
    const budget = await listRecords(TABLES.budget, { filterByFormula: formula }, requestId);
    if (budget.some((b) => b.id === budgetId)) return true;
  }

  // 2. סמל מוסד of the position is one of the institution's symbols
  const symbolId = recordLinks(position.fields[POSITION_FIELDS.symbolLink])[0];
  if (symbolId) {
    const symbols = await getSymbolsForInstitution(mosadId);
    if (symbols.some((s) => s.id === symbolId)) return true;
  }

  // 3. the linked employee belongs to this institution
  const employeeId = recordLinks(position.fields[POSITION_FIELDS.employeeLink])[0];
  if (employeeId) {
    const employee = await getRecord(TABLES.employees, employeeId, requestId);
    if (employee && recordLinks(employee.fields[EMPLOYEE_FIELDS.institution]).includes(mosadId)) {
      return true;
    }
  }

  logger.warn({ requestId, positionId, hasBudget: Boolean(budgetId), hasSymbol: Boolean(symbolId) },
    'position ownership could not be established');
  return false;
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
