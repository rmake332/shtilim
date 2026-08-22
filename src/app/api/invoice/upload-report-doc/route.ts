import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRecord, updateRecord, uploadAttachment } from '@/lib/airtable/client';
import { TABLES, INVOICE_REPORT_FIELDS } from '@/lib/airtable/schema';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { getPosition } from '@/lib/invoice/positions';
import { MAX_DOC_BYTES } from '@/lib/formTypes';
import { logger } from '@/lib/logger';

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

/**
 * POST /api/invoice/upload-report-doc - חשבונית (או דרישת תשלום) אחת, מועלית או
 * מוחלפת על רשומת דיווח חודשי חשבונית. Token-gated; בעלות מאומתת דרך שרשרת
 * הקישורים (דיווח → תקן חשבונית → שורת תקציב → מוסד). נעילת חודש נבדקת מפורשות
 * בשרת (לא רק ב-UI) - אין להעלות/להחליף קובץ לחודש שכבר ננעל.
 *
 * **החלפה, לא הוספה**: שדה הצירוף הוא attachments (מערך), וה-uploadAttachment
 * endpoint של Airtable מוסיף לרשימה הקיימת ולא מחליף אותה - בלי ניקוי מפורש
 * לפני ההעלאה, "החלפת" חשבונית הייתה משאירה שתי חשבוניות באותו שדה, כאשר
 * invoiceAttachment() (reports.ts) קורא רק את הראשונה - כך שדווקא החשבונית
 * הישנה הייתה ממשיכה לשמש בפועל בהפקת "בקשת תשלום", לא החדשה. לכן השדה מנוקה
 * (PATCH לערך ריק) לפני שהקובץ החדש מועלה.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { reportId, file } = body as {
    reportId?: string;
    file?: { filename?: string; contentType?: string; base64?: string };
  };

  if (!reportId || !file?.base64) {
    return NextResponse.json({ ok: false, message: 'חסרים נתוני קובץ.' }, { status: 400 });
  }
  if (Math.floor((file.base64.length * 3) / 4) > MAX_DOC_BYTES) {
    return NextResponse.json({ ok: false, message: 'הקובץ גדול מדי.' }, { status: 413 });
  }

  try {
    const mock = process.env.AIRTABLE_MOCK === '1';
    if (!mock) {
      const report = await getRecord(TABLES.invoiceReports, reportId, gate.requestId);
      if (!report) {
        return NextResponse.json({ ok: false, message: 'דיווח לא נמצא.' }, { status: 404 });
      }
      const positionId = recordLinks(report.fields[INVOICE_REPORT_FIELDS.positionLink])[0];
      const position = positionId ? await getPosition(positionId, gate.requestId) : null;
      const row = position
        ? await fetchInvoiceBudgetRow(gate.institution.mosadId, position.budgetRowId, gate.requestId)
        : null;
      if (!row) {
        logger.warn({ requestId: gate.requestId, reportId }, 'upload rejected: report not owned by institution');
        return NextResponse.json({ ok: false, message: 'אין הרשאה לרשומה זו.' }, { status: 403 });
      }
      if (report.fields[INVOICE_REPORT_FIELDS.monthlyTransferDocGenerated]) {
        return NextResponse.json(
          { ok: false, message: 'חודש זה כבר ננעל - בקשת התשלום כבר נשלחה, לא ניתן להחליף קובץ.' },
          { status: 409 },
        );
      }
      await updateRecord(TABLES.invoiceReports, reportId, { [INVOICE_REPORT_FIELDS.invoiceDoc]: [] }, gate.requestId);
    }
    await uploadAttachment(
      reportId,
      INVOICE_REPORT_FIELDS.invoiceDoc,
      {
        filename: file.filename || 'document',
        contentType: file.contentType || 'application/octet-stream',
        base64: file.base64,
      },
      gate.requestId,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, reportId, err: String(e) }, 'upload-report-doc failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בהעלאת הקובץ.' }, { status: 500 });
  }
}
