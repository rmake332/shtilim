import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { uploadAttachment } from '@/lib/airtable/client';
import { SUB_ROLE_DOC_FIELDS, DOC_FIELDS } from '@/lib/airtable/schema';
import { MAX_DOC_BYTES } from '@/lib/formTypes';
import { logger } from '@/lib/logger';

/**
 * Field IDs that may receive an upload — restricted to the sub-role doc fields and the
 * youth/role doc fields (excluding נתוני העסקה, which is filed on the position instead).
 */
const ALLOWED_FIELD_IDS = new Set<string>([
  ...SUB_ROLE_DOC_FIELDS.map((d) => d.fieldId),
  ...DOC_FIELDS.filter((d) => d.key !== 'docEmployment').map((d) => d.fieldId),
]);
/** Server-side cap mirroring the client (see MAX_DOC_BYTES — bounded by the host body limit). */

/**
 * POST /api/upload-employee-doc — upload ONE professional-license or youth/role document
 * to an employee record (רשימת עובדים). Token-gated; field id whitelisted. Unlike
 * /api/upload-doc (position-scoped), רשימת עובדים is network-wide and not scoped to
 * a single institution, matching PATCH /api/employees/[id]'s existing trust boundary.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { employeeId, fieldId, file } = body as {
    employeeId?: string;
    fieldId?: string;
    file?: { filename?: string; contentType?: string; base64?: string };
  };

  if (!employeeId || !fieldId || !file?.base64) {
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
    await uploadAttachment(
      employeeId,
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
    logger.error({ requestId: gate.requestId, employeeId, err: String(e) }, 'upload-employee-doc failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בהעלאת הקובץ.' }, { status: 500 });
  }
}
