import 'server-only';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { PDFDocument } from 'pdf-lib';
import { google, type drive_v3 } from 'googleapis';
import { logger } from '@/lib/logger';
import { getSystemSetting } from '@/lib/settings';
import { SETTINGS_KEYS } from '@/lib/airtable/schema';
import type { InvoiceAttachment } from '@/lib/invoice/reports';

/** שורת עובד בטבלת "בקשת תשלום". */
export interface PaymentRequestRow {
  employeeName: string;
  invoiceNumber: string;
  vatNumber: string;
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
  /** סעיף תקציב: budgetRow.title (שם התפקיד/התקן). */
  budgetLine: string;
  amount: number;
  /** קובץ החשבונית שהעובד צירף - מועלה בנפרד לתיקיית החודש וממוזג ל-PDF המאוחד. */
  invoiceAttachment?: InvoiceAttachment | null;
}

export interface BuildPaymentRequestHtmlParams {
  institutionName: string;
  /** פורמט "YYYY-MM". */
  month: string;
  rows: PaymentRequestRow[];
  /** לוגו "מיוחדים בחינוך", כ-data URI מלא (data:image/png;base64,...). מדלג על הלוגו אם חסר. */
  logoDataUri?: string;
}

const HEBREW_MONTH_NAMES = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

/** "2026-07" → "יולי 2026". */
function formatMonthHebrew(month: string): string {
  const [year, monthNum] = month.split('-');
  const name = HEBREW_MONTH_NAMES[Number(monthNum) - 1] ?? monthNum;
  return `${name} ${year}`;
}

/** תאריך נוכחי כ-DD/MM/YYYY. */
function formatDateHebrew(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** "2026-08" → "08.26", לשם הקובץ. */
function formatMonthNumeric(month: string): string {
  const [year, monthNum] = month.split('-');
  return `${monthNum}.${year.slice(2)}`;
}

/** סכום עם מפריד אלפים ו-₪, בלי אפסים מיותרים אחרי הנקודה (כמו formatNum). */
function formatCurrency(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const [intPart, decPart] = rounded.toFixed(2).split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmedDec = decPart.replace(/0+$/, '');
  return `${withThousands}${trimmedDec ? `.${trimmedDec}` : ''} ₪`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bankDetails(row: PaymentRequestRow): string {
  return `בנק ${escapeHtml(row.bankName)}, סניף ${escapeHtml(row.bankBranch)}, ח-ן ${escapeHtml(row.bankAccountNumber)}`;
}

/**
 * בונה את ה-HTML המלא של מסמך "בקשת תשלום" (מועלה ל-Drive בהמשך והופך ל-Google Doc).
 *
 * עיצוב סופי אושר מול Drive אמיתי (5 סבבי איטרציה), ראו זיכרון feature-invoice-positions
 * ואת התוכנית optimized-hopping-zephyr.md. אין לשנות מבנה/סדר עמודות/colspan/פונט/צבעים
 * בלי לאשר עם המשתמש קודם.
 *
 * מלכודת RTL: ה-HTML→Google Docs converter של Drive מתעלם מ-dir="rtl" לגבי סדר העמודות
 * בטבלה, הן נבנות תמיד לפי הסדר הליניארי של ה-HTML. לכן ה-th/td בכל שורה נכתבים כאן
 * בסדר הפוך (העמודה שאמורה להופיע הכי מימין נכתבת אחרונה בקוד).
 */
export function buildPaymentRequestHtml(params: BuildPaymentRequestHtmlParams): string {
  const { institutionName, month, rows } = params;
  const monthLabel = formatMonthHebrew(month);
  const dateLabel = formatDateHebrew(new Date());
  const institutionEscaped = escapeHtml(institutionName);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  const bodyRows = rows
    .map(
      (row) => `  <tr>
    <td>&#10003;</td>
    <td>${escapeHtml(row.budgetLine)}</td>
    <td>${formatCurrency(row.amount)}</td>
    <td class="name-cell">${escapeHtml(row.employeeName)}</td>
    <td>${escapeHtml(row.vatNumber)}</td>
    <td>${escapeHtml(row.invoiceNumber)}</td>
    <td>${bankDetails(row)}</td>
    <td></td>
  </tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: 'Noto Sans Hebrew', Arial, sans-serif;
    direction: rtl;
    text-align: right;
    color: #1a1a1a;
    font-size: 11pt;
  }
  .logo {
    text-align: center;
    margin-bottom: 10px;
  }
  .logo img {
    height: 55px;
  }
  .bsd {
    text-align: right;
    font-size: 10pt;
    margin-bottom: 4px;
  }
  h1 {
    text-align: center;
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: 1px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  p.field-line {
    margin: 3px 0;
    font-size: 11pt;
  }
  p.field-line span.label {
    font-weight: bold;
  }
  table.main {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
    margin-top: 18px;
  }
  table.main th {
    background-color: #e3e8ef;
    border: 1px solid #1a1a1a;
    padding: 7px 5px;
    font-weight: bold;
    text-align: center;
  }
  table.main td {
    border: 1px solid #1a1a1a;
    padding: 6px 5px;
    text-align: center;
  }
  table.main td.name-cell {
    text-align: right;
  }
  tr.total-row td {
    font-weight: bold;
    background-color: #f2f2f2;
    border-top: 2px solid #1a1a1a;
  }
  tr.total-row td.total-label {
    text-align: left;
    padding-left: 12px;
  }
</style>
</head>
<body>
${params.logoDataUri ? `\n<div class="logo"><img src="${params.logoDataUri}" alt="מיוחדים בחינוך"></div>\n` : ''}
<div class="bsd">בס"ד</div>
<h1>טופס בקשת תשלומים</h1>

<p class="field-line"><span class="label">תאריך:</span> ${dateLabel}</p>
<p class="field-line"><span class="label">חודש בקשת תשלום:</span> ${monthLabel}</p>
<p class="field-line"><span class="label">המוסד המזמין:</span> ${institutionEscaped}</p>
<p class="field-line"><span class="label">שם המזמין:</span> ${institutionEscaped}</p>

<table class="main">
  <tr>
    <th>אישור מח' שכר</th>
    <th>סעיף תקציב</th>
    <th>סכום</th>
    <th>שם ספק</th>
    <th>מספר עוסק</th>
    <th>מס' חשבונית</th>
    <th>פרטי חשבון בנק</th>
    <th>תאריך תשלום</th>
  </tr>
${bodyRows}
  <tr class="total-row">
    <td colspan="2" class="total-label">סה"כ</td>
    <td>${formatCurrency(total)}</td>
    <td colspan="5"></td>
  </tr>
</table>

</body>
</html>`;
}

let cachedLogoDataUri: string | null = null;

/**
 * קורא את public/logo_meyuhadim.png פעם אחת ומחזיר data URI מוכן להטמעה ב-HTML.
 * PNG ולא WebP (המקור בפועל ב-public/) - נבדק בפועל שה-HTML→Docs converter של
 * Drive מתעלם בשקט מ-<img> עם data URI מסוג image/webp (המסמך נוצר בלי שגיאה,
 * אבל בלי תמונה בכלל). ה-PNG הומר פעם אחת מה-webp המקורי (sharp, לא runtime dependency).
 */
function getLogoDataUri(): string | undefined {
  if (cachedLogoDataUri !== null) return cachedLogoDataUri;
  try {
    const filePath = path.join(process.cwd(), 'public', 'logo_meyuhadim.png');
    const base64 = fs.readFileSync(filePath).toString('base64');
    cachedLogoDataUri = `data:image/png;base64,${base64}`;
  } catch (err) {
    logger.error({ err }, 'failed to read logo file for payment request doc');
    cachedLogoDataUri = '';
  }
  return cachedLogoDataUri || undefined;
}

/**
 * OAuth2 כמשתמש Google אמיתי (לא Service Account): ל-Service Account רגיל אין מכסת
 * אחסון עצמאית ב-Drive, ו-Shared Drive/domain-wide delegation דורשים Google Workspace.
 * ה-refresh token נוצר פעם אחת ידנית (ראו .env.example) ולא פג תוקף, כך שהמסמכים נוצרים
 * ישירות בחשבון Drive הרגיל של המשתמש, במכסה שלו.
 */
function getDriveAuth(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'חסרים משתני סביבה: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN',
    );
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

/** שם תיקייה יחיד לחיפוש/יצירה תחת parentId (לא רקורסיבי - Drive מרשה שמות כפולים). */
async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
  requestId: string | undefined,
): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'");
  const query = `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const { data: found } = await drive.files.list({ q: query, fields: 'files(id)', pageSize: 1 });
  const existingId = found.files?.[0]?.id;
  if (existingId) return existingId;

  const { data: created } = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  logger.info({ requestId, folderId: created.id, name, parentId }, 'payment request doc folder created');
  if (!created.id) throw new Error(`Drive לא החזיר מזהה עבור תיקייה חדשה: ${name}`);
  return created.id;
}

function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** קובץ בינארי (חשבונית / PDF מאוחד) בתיקייה נתונה, עם תוכן גולמי (לא HTML→Docs, זה לא מומר). */
async function uploadRawFile(
  drive: drive_v3.Drive,
  params: { name: string; mimeType: string; parentId: string; bytes: Uint8Array },
): Promise<{ id: string; webViewLink: string }> {
  const { data } = await drive.files.create({
    requestBody: { name: params.name, parents: [params.parentId] },
    media: { mimeType: params.mimeType, body: Readable.from(Buffer.from(params.bytes)) },
    fields: 'id, webViewLink',
  });
  if (!data.id || !data.webViewLink) {
    throw new Error(`Drive לא החזיר מזהה/קישור עבור הקובץ: ${params.name}`);
  }
  return { id: data.id, webViewLink: data.webViewLink };
}

/** שולף את תוכן קובץ הצירוף (מה-CDN הזמני של Airtable) כ-bytes גולמיים. */
async function fetchAttachmentBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`שליפת קובץ הצירוף נכשלה (סטטוס ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

/**
 * ממזג את PDF מסמך "בקשת התשלום" עם כל קבצי החשבוניות המצורפים ל-PDF אחד: חשבוניות
 * שהן כבר PDF מצורפות כעמודים נוספים; תמונות (jpg/png) הופכות לעמוד PDF חדש. קובץ
 * בודד שנכשל בטעינה (למשל PDF פגום) מדולג עם לוג - לא מפיל את כל המיזוג.
 */
async function mergeInvoicesIntoPdf(
  basePdfBytes: Uint8Array,
  invoices: Array<{ bytes: Uint8Array; contentType: string }>,
  requestId?: string,
): Promise<Uint8Array> {
  const merged = await PDFDocument.load(basePdfBytes);
  for (const invoice of invoices) {
    try {
      if (invoice.contentType === 'application/pdf') {
        const src = await PDFDocument.load(invoice.bytes);
        const copiedPages = await merged.copyPages(src, src.getPageIndices());
        for (const page of copiedPages) merged.addPage(page);
      } else if (invoice.contentType === 'image/jpeg' || invoice.contentType === 'image/jpg') {
        const image = await merged.embedJpg(invoice.bytes);
        merged.addPage([image.width, image.height]).drawImage(image, {
          x: 0, y: 0, width: image.width, height: image.height,
        });
      } else if (invoice.contentType === 'image/png') {
        const image = await merged.embedPng(invoice.bytes);
        merged.addPage([image.width, image.height]).drawImage(image, {
          x: 0, y: 0, width: image.width, height: image.height,
        });
      } else {
        logger.warn({ requestId, contentType: invoice.contentType }, 'skipping unsupported invoice file type in merge');
      }
    } catch (err) {
      logger.error({ requestId, err, contentType: invoice.contentType }, 'skipping invoice file that failed to merge');
    }
  }
  return merged.save();
}

export interface GeneratePaymentRequestDocParams extends BuildPaymentRequestHtmlParams {
  /**
   * קישור המסמך הקודם שהופק לאותו מוסד+חודש (אם יש) - Drive לא תומך בעדכון תוכן
   * קובץ קיים, אז במקום זה מייצרים מסמך חדש ומעבירים את הישן ל-trash אחרי שהחדש
   * נוצר בהצלחה (לא הפוך - כדי לא לאבד את הישן אם היצירה החדשה נכשלת).
   */
  previousDocUrl?: string;
}

export interface GeneratePaymentRequestDocResult {
  /** קישור למסמך "בקשת תשלום" עצמו (Google Doc). */
  url: string;
  /** קישור לתיקיית Drive של החודש - כולל המסמך, כל קובצי החשבוניות בנפרד, וה-PDF המאוחד. */
  folderUrl: string;
  /** קישור ל-PDF אחד שממזג את מסמך בקשת התשלום עם כל קובצי החשבוניות (בזה אחר זה). */
  mergedPdfUrl: string;
  /** מזהה הקובץ הגולמי ב-Drive של ה-PDF המאוחד (לא קישור) - לשימוש ב-Make webhook. */
  mergedPdfFileId: string;
}

/**
 * בונה את ה-HTML (buildPaymentRequestHtml) ומעלה אותו ל-Drive כ-Google Doc אמיתי, דרך
 * drive.files.create עם mimeType יעד 'application/vnd.google-apps.document'. Drive ממיר
 * את ה-HTML אוטומטית, כולל הטבלה. אין Docs API ואין טמפלייט קבוע: כל קריאה יוצרת מסמך
 * חדש מאפס (files.update לא תומך בעדכון תוכן, רק מטא-דאטה) - "דריסה" של מסמך לאותו
 * חודש ממומשת כיצירת מסמך חדש + trash לישן (ראו previousDocUrl). בפועל, מאז שנוסף
 * נעילת חודש מלאה (ראו finish-report route), הענף הזה כבר לא אמור להתרחש - נשאר
 * כהגנה, לא הורחב לקבצים החדשים (חשבוניות בנפרד / PDF מאוחד).
 *
 * מבנה תיקיות ב-Drive: {תיקיית יעד}/{שנת לימודים}/{שם מוסד}/{חודש}/{קבצים}. שנת הלימודים
 * נקראת מטבלת "הגדרות מערכת" (SETTINGS_KEYS.academicYear) כדי שעדכון שנה לא ידרוש שינוי
 * קוד - רק עדכון הערך ב-Airtable. כל התיקיות נוצרות אוטומטית בפעם הראשונה.
 *
 * בתיקיית החודש נוצרים 3 סוגי קבצים: (1) מסמך "בקשת תשלום" (Google Doc, מהטבלה); (2) כל
 * קובצי החשבוניות שהעובדים צירפו, כל אחד בנפרד (כפי שהועלה - PDF או תמונה); (3) PDF אחד
 * שממזג את מסמך בקשת התשלום (מיוצא מ-Drive כ-PDF) עם כל קובצי החשבוניות ברצף
 * (mergeInvoicesIntoPdf, ראו למעלה) - הדרישה המקורית הייתה גם וגם, לא אחד מהשניים.
 */
export async function generatePaymentRequestDoc(
  params: GeneratePaymentRequestDocParams,
  requestId?: string,
): Promise<GeneratePaymentRequestDocResult> {
  const rootFolderId = process.env.GOOGLE_PAYMENT_DEST_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error('חסר משתנה סביבה: GOOGLE_PAYMENT_DEST_FOLDER_ID');
  }
  const academicYear = await getSystemSetting(SETTINGS_KEYS.academicYear, requestId);
  if (!academicYear) {
    throw new Error(
      `חסרה הגדרת שנת לימודים בטבלת "הגדרות מערכת" (מפתח ${SETTINGS_KEYS.academicYear})`,
    );
  }

  const html = buildPaymentRequestHtml({ ...params, logoDataUri: getLogoDataUri() });
  const docName = `${formatMonthNumeric(params.month)} - בקשת תשלום חשבוניות - הדרכות פרא ${params.institutionName}`;

  try {
    const auth = getDriveAuth();
    const drive = google.drive({ version: 'v3', auth });
    const yearFolderId = await findOrCreateFolder(drive, academicYear, rootFolderId, requestId);
    const institutionFolderId = await findOrCreateFolder(drive, params.institutionName, yearFolderId, requestId);
    const monthFolderId = await findOrCreateFolder(drive, params.month, institutionFolderId, requestId);

    const { data } = await drive.files.create({
      requestBody: {
        name: docName,
        mimeType: 'application/vnd.google-apps.document',
        parents: [monthFolderId],
      },
      media: { mimeType: 'text/html', body: html },
      fields: 'id, webViewLink',
    });
    if (!data.id || !data.webViewLink) {
      throw new Error('Drive לא החזיר מזהה/קישור עבור המסמך שנוצר');
    }
    logger.info({ requestId, fileId: data.id, docName }, 'payment request doc created');

    const previousFileId = params.previousDocUrl ? extractDriveFileId(params.previousDocUrl) : null;
    if (previousFileId) {
      try {
        await drive.files.update({ fileId: previousFileId, requestBody: { trashed: true } });
        logger.info({ requestId, previousFileId }, 'previous payment request doc trashed');
      } catch (err) {
        // המסמך החדש כבר נוצר בהצלחה - כשל בהעברת הישן ל-trash לא אמור להיכשל את כל הפעולה.
        logger.error({ requestId, err, previousFileId }, 'failed to trash previous payment request doc');
      }
    }

    // כל קובצי החשבוניות בנפרד, בתיקיית החודש - וכן אוספים bytes+contentType למיזוג ה-PDF.
    const invoiceFiles: Array<{ bytes: Uint8Array; contentType: string }> = [];
    for (const row of params.rows) {
      const attachment = row.invoiceAttachment;
      if (!attachment) continue;
      try {
        const bytes = await fetchAttachmentBytes(attachment.url);
        invoiceFiles.push({ bytes, contentType: attachment.contentType });
        const ext = EXTENSION_BY_MIME[attachment.contentType] ?? path.extname(attachment.filename).replace('.', '') ?? 'bin';
        await uploadRawFile(drive, {
          name: `חשבונית - ${row.employeeName}.${ext}`,
          mimeType: attachment.contentType,
          parentId: monthFolderId,
          bytes,
        });
      } catch (err) {
        // חשבונית בודדת שנכשלה (קישור פג/שגיאת רשת) לא אמורה להפיל את כל הפקת המסמך.
        logger.error({ requestId, err, employeeName: row.employeeName }, 'failed to fetch/upload individual invoice file');
      }
    }

    const { data: exported } = await drive.files.export(
      { fileId: data.id, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' },
    );
    const basePdfBytes = new Uint8Array(exported as ArrayBuffer);
    const mergedBytes = await mergeInvoicesIntoPdf(basePdfBytes, invoiceFiles, requestId);
    const mergedFile = await uploadRawFile(drive, {
      name: `${docName} - מאוחד עם חשבוניות.pdf`,
      mimeType: 'application/pdf',
      parentId: monthFolderId,
      bytes: mergedBytes,
    });

    return {
      url: data.webViewLink,
      folderUrl: `https://drive.google.com/drive/folders/${monthFolderId}`,
      mergedPdfUrl: mergedFile.webViewLink,
      mergedPdfFileId: mergedFile.id,
    };
  } catch (err) {
    logger.error({ requestId, err, docName }, 'payment request doc generation failed');
    throw new Error('יצירת מסמך בקשת התשלום נכשלה, בדקו את תוקף ה-OAuth refresh token ואת מזהה תיקיית היעד ב-Drive');
  }
}
