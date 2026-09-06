import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { uploadAttachment } from '@/lib/airtable/client';
import { DOC_FIELDS } from '@/lib/airtable/schema';
import { subRoleDocFieldIds } from '@/lib/subRoleTable';
import { MAX_DOC_BYTES } from '@/lib/formTypes';
import { logger } from '@/lib/logger';

/**
 * אילו שדות מותר להעלות אליהם: מסמכי הנוער/תפקיד (מוגדרים בקוד) יחד עם מסמכי
 * ההסמכה שטבלת תת-תפקידים מפנה אליהם. החלק השני נשלף בזמן ריצה, כדי שסוג מסמך
 * חדש שיתווסף בטבלה יתקבל בלי שינוי קוד. נתוני העסקה מוחרג: הוא מתויק על התקן.
 */
async function allowedFieldIds(): Promise<Set<string>> {
  return new Set<string>([
    ...(await subRoleDocFieldIds()),
    ...DOC_FIELDS.filter((d) => d.key !== 'docEmployment').map((d) => d.fieldId),
  ]);
}
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
  if (!(await allowedFieldIds()).has(fieldId)) {
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
