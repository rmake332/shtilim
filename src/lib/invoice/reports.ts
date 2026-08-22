import 'server-only';
import {
  listRecords,
  createRecord,
  updateRecord,
  escapeFormulaValue,
  type AirtableRecord,
} from '@/lib/airtable/client';
import { TABLES, INVOICE_REPORT_FIELDS } from '@/lib/airtable/schema';

/** קובץ החשבונית המצורף לדיווח - נשלף בזמן הפקת "בקשת תשלום" (מיזוג PDF, העלאה נפרדת ל-Drive). */
export interface InvoiceAttachment {
  url: string;
  filename: string;
  contentType: string;
}

/** דיווח שעות בפועל וחשבונית לתשלום, לעובד חשבונית אחד בחודש נתון. */
export interface InvoiceMonthlyReport {
  id: string;
  positionId: string;
  /** פורמט "YYYY-MM". */
  month: string;
  reportedHours: number;
  reportedRate: number;
  totalPay: number;
  hasInvoiceDoc: boolean;
  invoiceAttachment: InvoiceAttachment | null;
  invoiceNumber: string;
  reportedAt: string;
  monthlyTransferDocGenerated: boolean;
  paymentRequestDocUrl: string;
  paymentRequestFolderUrl: string;
  mergedPdfUrl: string;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter(Boolean) as string[];
}

/** שדה attachments של Airtable מוחזר כמערך {url, filename, type, ...} - לוקחים רק את הראשון. */
function invoiceAttachment(v: unknown): InvoiceAttachment | null {
  if (!Array.isArray(v) || !v[0]) return null;
  const a = v[0] as { url?: string; filename?: string; type?: string };
  if (!a.url) return null;
  return { url: a.url, filename: a.filename || 'חשבונית', contentType: a.type || 'application/octet-stream' };
}

function mapReport(r: AirtableRecord): InvoiceMonthlyReport {
  const f = r.fields;
  const doc = f[INVOICE_REPORT_FIELDS.invoiceDoc];
  return {
    id: r.id,
    positionId: recordLinks(f[INVOICE_REPORT_FIELDS.positionLink])[0] ?? '',
    month: str(f[INVOICE_REPORT_FIELDS.reportMonth]),
    reportedHours: num(f[INVOICE_REPORT_FIELDS.reportedHours]),
    reportedRate: num(f[INVOICE_REPORT_FIELDS.reportedRate]),
    totalPay: num(f[INVOICE_REPORT_FIELDS.totalPay]),
    hasInvoiceDoc: Array.isArray(doc) && doc.length > 0,
    invoiceAttachment: invoiceAttachment(doc),
    invoiceNumber: str(f[INVOICE_REPORT_FIELDS.invoiceNumber]),
    reportedAt: str(f[INVOICE_REPORT_FIELDS.reportedAt]),
    monthlyTransferDocGenerated: Boolean(f[INVOICE_REPORT_FIELDS.monthlyTransferDocGenerated]),
    paymentRequestDocUrl: str(f[INVOICE_REPORT_FIELDS.paymentRequestDocUrl]),
    paymentRequestFolderUrl: str(f[INVOICE_REPORT_FIELDS.paymentRequestFolderUrl]),
    mergedPdfUrl: str(f[INVOICE_REPORT_FIELDS.mergedPdfUrl]),
  };
}

/**
 * כל הדיווחים לחודש נתון, עבור קבוצת positionIds (למשל כל העובדים תחת שורת תקציב אחת).
 * חודש הדיווח מסונן ב-Airtable (שדה טקסט רגיל, זול); ההתאמה ל-positionIds נעשית
 * ב-memory - ARRAYJOIN על שדה multipleRecordLinks מחזיר שמות ולא מזהים, כך שאין דרך
 * לסנן לפי record id ישירות בנוסחה על שדה כזה.
 */
export async function listReportsForPositions(
  positionIds: string[],
  month: string,
  requestId?: string,
): Promise<InvoiceMonthlyReport[]> {
  if (!positionIds.length) return [];
  const formula = `{${INVOICE_REPORT_FIELDS.reportMonth}}="${escapeFormulaValue(month)}"`;
  const records = await listRecords(TABLES.invoiceReports, { filterByFormula: formula }, requestId);
  const idSet = new Set(positionIds);
  return records
    .filter((r) => recordLinks(r.fields[INVOICE_REPORT_FIELDS.positionLink]).some((id) => idSet.has(id)))
    .map(mapReport);
}

/** כל הדיווחים ההיסטוריים של הקצאה (עובד) בודדת, לכל החודשים. */
export async function listReportsForPosition(
  positionId: string,
  requestId?: string,
): Promise<InvoiceMonthlyReport[]> {
  const records = await listRecords(TABLES.invoiceReports, {}, requestId);
  return records
    .filter((r) => recordLinks(r.fields[INVOICE_REPORT_FIELDS.positionLink]).includes(positionId))
    .map(mapReport);
}

/** יוצר או מעדכן (אם כבר קיים דיווח לאותה הקצאה+חודש) שורת דיווח חודשי. */
export async function upsertReport(
  params: {
    positionId: string;
    positionLabel: string;
    month: string;
    reportedHours: number;
    reportedRate: number;
    invoiceNumber: string;
  },
  requestId?: string,
): Promise<InvoiceMonthlyReport> {
  const existing = await listReportsForPositions([params.positionId], params.month, requestId);
  const reportedAt = new Date().toISOString();
  const fields = {
    [INVOICE_REPORT_FIELDS.positionLink]: [params.positionId],
    [INVOICE_REPORT_FIELDS.reportMonth]: params.month,
    [INVOICE_REPORT_FIELDS.reportedHours]: params.reportedHours,
    [INVOICE_REPORT_FIELDS.reportedRate]: params.reportedRate,
    [INVOICE_REPORT_FIELDS.reportedAt]: reportedAt,
    [INVOICE_REPORT_FIELDS.invoiceNumber]: params.invoiceNumber,
  };
  const totalPay = Math.round(params.reportedHours * params.reportedRate * 100) / 100;

  // Airtable's create/update response isn't keyed by field ID (only GET/list requests
  // set returnFieldsByFieldId) - build the result from known params instead of the response.
  if (existing[0]) {
    await updateRecord(TABLES.invoiceReports, existing[0].id, fields, requestId);
    return {
      ...existing[0],
      month: params.month,
      reportedHours: params.reportedHours,
      reportedRate: params.reportedRate,
      totalPay,
      invoiceNumber: params.invoiceNumber,
      reportedAt,
    };
  }
  const r = await createRecord(
    TABLES.invoiceReports,
    { ...fields, [INVOICE_REPORT_FIELDS.reportLabel]: `${params.positionLabel} - ${params.month}` },
    requestId,
  );
  return {
    id: r.id,
    positionId: params.positionId,
    month: params.month,
    reportedHours: params.reportedHours,
    reportedRate: params.reportedRate,
    totalPay,
    hasInvoiceDoc: false,
    invoiceAttachment: null,
    invoiceNumber: params.invoiceNumber,
    reportedAt,
    monthlyTransferDocGenerated: false,
    paymentRequestDocUrl: '',
    paymentRequestFolderUrl: '',
    mergedPdfUrl: '',
  };
}

/** מסמן את כל דיווחי החודש (לקבוצת positionIds) כ"בקשת העברות הופקה" (stub - אין עדיין הפקת מסמך בפועל). */
export async function markMonthFinished(
  positionIds: string[],
  month: string,
  requestId?: string,
): Promise<number> {
  const reports = await listReportsForPositions(positionIds, month, requestId);
  for (const rep of reports) {
    await updateRecord(
      TABLES.invoiceReports,
      rep.id,
      { [INVOICE_REPORT_FIELDS.monthlyTransferDocGenerated]: true },
      requestId,
    );
  }
  return reports.length;
}

/**
 * כותב את קישורי "בקשת תשלום" (מסמך + תיקייה + PDF מאוחד) על כל שורות הדיווח של
 * החודש (לקבוצת positionIds) - אותה מוסכמה כמו הצ'קבוקס monthlyTransferDocGenerated.
 */
export async function saveDocUrlForMonth(
  positionIds: string[],
  month: string,
  urls: { docUrl: string; folderUrl: string; mergedPdfUrl: string },
  requestId?: string,
): Promise<void> {
  const reports = await listReportsForPositions(positionIds, month, requestId);
  for (const rep of reports) {
    await updateRecord(
      TABLES.invoiceReports,
      rep.id,
      {
        [INVOICE_REPORT_FIELDS.paymentRequestDocUrl]: urls.docUrl,
        [INVOICE_REPORT_FIELDS.paymentRequestFolderUrl]: urls.folderUrl,
        [INVOICE_REPORT_FIELDS.mergedPdfUrl]: urls.mergedPdfUrl,
      },
      requestId,
    );
  }
}
