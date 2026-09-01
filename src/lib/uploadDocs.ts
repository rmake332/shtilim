import type { UploadedDoc } from '@/lib/formTypes';

/** מסמך שממתין להעלאה לרשומת העובד, עם המפתח שבו הוא יושב ב-YouthDocs. */
export interface EmployeeDocItem {
  /** המפתח ב-YouthDocs: doc.key למסמכי נוער/תפקיד, fieldId למסמכי תת-תפקיד. */
  docsKey: string;
  fieldId: string;
  label: string;
  file: UploadedDoc;
}

export interface UploadDocsResult {
  /** מפתחות YouthDocs שהועלו בהצלחה - יש להסיר אותם מ-docs כדי שלא יועלו שוב. */
  uploadedKeys: string[];
  /** שדות איירטייבל שכעת יש בהם קובץ - נוספים ל-existing*Docs של העובד. */
  uploadedFieldIds: string[];
  /** תוויות המסמכים שנכשלו; הקבצים שלהם נשארים ב-docs וינסו שוב בשליחת הטופס. */
  failedLabels: string[];
}

/**
 * העלאת קובץ בודד, עם ניסיון חוזר אחד. בקשה אחת לקובץ - כך כל גוף בקשה נשאר מתחת
 * למגבלת הגודל של הפלטפורמה (ראו fix-doc-upload-and-work-start-date).
 */
export async function uploadOneDoc(url: string, body: Record<string, unknown>): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) return true;
    } catch {
      /* ניסיון נוסף */
    }
  }
  return false;
}

/**
 * העלאת מסמכי עובד ל"רשימת עובדים" ברגע שרשומת העובד קיימת, בלי להמתין לשליחת הטופס -
 * כדי שמסמך שכבר צורף לא ילך לאיבוד אם התהליך ננטש לפני יצירת התקן.
 *
 * שדה הקובץ באיירטייבל הוא multipleAttachments וההעלאה *מוסיפה* קובץ, ולכן על הקורא
 * להסיר מ-docs כל מפתח שחוזר ב-uploadedKeys; אחרת אותו קובץ יועלה שוב בשליחה ויופיעו
 * שני עותקים. כישלון אינו חוסם: הקובץ נשאר ב-docs ו-SummaryStep ינסה שוב בשליחה.
 */
export async function uploadEmployeeDocs(
  params: { token: string; employeeId: string; items: EmployeeDocItem[] },
  onProgress?: (done: number, total: number) => void,
): Promise<UploadDocsResult> {
  const { token, employeeId, items } = params;
  const result: UploadDocsResult = { uploadedKeys: [], uploadedFieldIds: [], failedLabels: [] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);
    const ok = await uploadOneDoc('/api/upload-employee-doc', {
      token,
      employeeId,
      fieldId: item.fieldId,
      file: item.file,
    });
    if (ok) {
      result.uploadedKeys.push(item.docsKey);
      result.uploadedFieldIds.push(item.fieldId);
    } else {
      result.failedLabels.push(item.label.split('\n')[0]);
    }
  }
  return result;
}
