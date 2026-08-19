import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRecord, uploadAttachment } from '@/lib/airtable/client';
import { TABLES, INVOICE_REPORT_FIELDS } from '@/lib/airtable/schema';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { getPosition } from '@/lib/invoice/positions';
import { MAX_DOC_BYTES } from '@/lib/formTypes';
import { logger } from '@/lib/logger';

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

/** Verify the report record belongs to the gated institution: דיווח → תקן חשבונית → שורת תקציב → מוסד. */
async function reportBelongsToInstitution(reportId: string, mosadId: string, requestId?: string): Promise<boolean> {
  const report = await getRecord(TABLES.invoiceReports, reportId, requestId);
  if (!report) return false;
  const positionId = recordLinks(report.fields[INVOICE_REPORT_FIELDS.positionLink])[0];
  if (!positionId) return false;
  const position = await getPosition(positionId, requestId);
  if (!position) return false;
  const row = await fetchInvoiceBudgetRow(mosadId, position.budgetRowId, requestId);
  return Boolean(row);
}

/**
 * POST /api/invoice/upload-report-doc - חשבונית (או דרישת תשלום) אחת,
 * מועלה על רשומת דיווח חודשי חשבונית. Token-gated; בעלות מאומתת דרך שרשרת הקישורים.
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
    const owned = mock || (await reportBelongsToInstitution(reportId, gate.institution.mosadId, gate.requestId));
    if (!owned) {
      logger.warn({ requestId: gate.requestId, reportId }, 'upload rejected: report not owned by institution');
      return NextResponse.json({ ok: false, message: 'אין הרשאה לרשומה זו.' }, { status: 403 });
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
