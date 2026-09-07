import 'server-only';
import { createRecord, updateRecord, getRecord } from '@/lib/airtable/client';
import { TABLES, EMPLOYEE_FIELDS } from '@/lib/airtable/schema';
import { findEmployeeByExactId } from '@/lib/employees';
import { logger } from '@/lib/logger';
import { joinFullName, type EmployeeData } from '@/lib/formTypes';

export interface UpsertEmployeeResult {
  employeeId: string;
  /** true כשנוצרה רשומה חדשה; false כשעודכנה רשומה קיימת (נבחרה או נמצאה לפי ת.ז.). */
  created: boolean;
  /**
   * נמצאה רשומה קיימת לפי ת.ז. כשהטופס עוד לא החזיק recordId - כלומר הפרטים מוזגו
   * לעובד אחר מזה שהמזכירה חשבה שהיא פותחת. שונה מ-created=false רגיל, שמשמעותו רק
   * שהרשומה שכבר שייכת לטופס עודכנה.
   */
  matchedByTz: boolean;
  /** השם שעל הרשומה הקיימת שאליה מוזגו הפרטים - מוצג למזכירה כשההתאמה לא הייתה צפויה. */
  matchedName?: string;
}

/**
 * כתיבת פרטי העובד ל"רשימת עובדים" - יצירה כשהוא חדש, עדכון כשהוא קיים.
 *
 * נקודת הכתיבה היחידה של טופס הקליטה לטבלת העובדים, ונקראת כמה פעמים לאותו עובד:
 * ברגע שפרטי העובד תקינים (כדי שהמידע יישמר גם אם התהליך לא יושלם), שוב בלחיצת
 * "המשך" כדי לתפוס עריכות מאוחרות, ושוב ב-submitForm.
 * לכן היא חייבת להיות אידמפוטנטית - ריצה נוספת מעדכנת ולא מוסיפה רשומה.
 */
export async function upsertEmployee(
  params: {
    employee: EmployeeData;
    institutionMosadId: string;
    /** מס' רישיון מתוך שלב התפקיד (אינו חלק מפרטי העובד בשלב הראשון). */
    licenseNumber?: string;
  },
  requestId?: string,
): Promise<UpsertEmployeeResult> {
  const { employee, institutionMosadId, licenseNumber } = params;
  // השם נכתב תמיד מהחלקים (שם משפחה ואז שם פרטי), כך שהמבנה בשדה הבודד של איירטייבל
  // אחיד גם אם הלקוח שלח name לא מסונכרן. נפילה ל-name למסלולים שאינם מזינים חלקים.
  const fullName = joinFullName(employee.lastName, employee.firstName) || employee.name;

  let employeeId = employee.recordId ?? '';
  let matchedName: string | undefined;
  let matchedByTz = false;
  if (!employeeId) {
    // Defense-in-depth: never create a duplicate. If the ID already exists, reuse it.
    const existing = await findEmployeeByExactId(employee.tz, requestId);
    if (existing) {
      logger.info({ requestId }, 'duplicate id on employee save — reusing existing employee');
      employeeId = existing.id;
      matchedName = existing.name;
      matchedByTz = true;
    }
  }

  if (!employeeId) {
    const created = await createRecord(
      TABLES.employees,
      {
        [EMPLOYEE_FIELDS.name]: fullName,
        [EMPLOYEE_FIELDS.tz]: employee.tz,
        [EMPLOYEE_FIELDS.address]: employee.address,
        [EMPLOYEE_FIELDS.email]: employee.email,
        [EMPLOYEE_FIELDS.phone]: employee.phone,
        [EMPLOYEE_FIELDS.maritalStatus]: employee.maritalStatus,
        [EMPLOYEE_FIELDS.gender]: employee.gender,
        [EMPLOYEE_FIELDS.birthDate]: employee.birthDate,
        [EMPLOYEE_FIELDS.institution]: [institutionMosadId],
        // תאריך תחילת עבודה יושב על העובד (לא על התקן) — נגזר מתאריך תחילת החוזה שבטופס.
        ...(employee.contractStartDate
          ? { [EMPLOYEE_FIELDS.workStartDate]: employee.contractStartDate }
          : {}),
        ...(licenseNumber ? { [EMPLOYEE_FIELDS.licenseNumber]: String(licenseNumber).trim() } : {}),
      },
      requestId,
    );
    logger.info({ requestId, employeeId: created.id }, 'employee record created');
    return { employeeId: created.id, created: true, matchedByTz: false };
  }

  // Existing employee — update any fields that were edited.
  //
  // **רק שדות שבאמת השתנו.** כתיבה של ערך זהה אינה תמימה: כל כתיבה יוצאת עם
  // typecast: true, ולכן ערך singleSelect שנמחק או שונה שמו באיירטייבל בינתיים
  // (למשל מיזוג "נשואה" ל"נשוי/אה") **נוצר מחדש** כאופציה חדשה ברגע שטופס שנטען
  // לפני השינוי נשמר. כך צצו מחדש "נשואה" ו-"נשוי/ה" אחרי שני מיזוגים ידניים.
  const current = await getRecord(TABLES.employees, employeeId, requestId);
  const stored = current?.fields ?? null;
  /** ערך תא מאיירטייבל כמחרוזת להשוואה (singleSelect חוזר לפעמים כאובייקט). */
  const asText = (v: unknown): string => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
    if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
      return String((v as { name: unknown }).name ?? '');
    }
    return String(v);
  };
  /**
   * מוסיף לעדכון רק אם יש ערך חדש והוא שונה מהמאוחסן. כשלא הצלחנו לקרוא את
   * הרשומה (מצב mock, או תקלה) חוזרים להתנהגות הישנה - עדיף כתיבה מיותרת מאשר
   * לדלג בשקט על עדכון אמיתי.
   */
  const empUpdate: Record<string, unknown> = {};
  const setIfChanged = (fieldId: string, next: string) => {
    if (!next) return;
    if (stored && asText(stored[fieldId]).trim() === next.trim()) return;
    empUpdate[fieldId] = next;
  };

  setIfChanged(EMPLOYEE_FIELDS.name, fullName);
  setIfChanged(EMPLOYEE_FIELDS.address, employee.address);
  setIfChanged(EMPLOYEE_FIELDS.email, employee.email);
  setIfChanged(EMPLOYEE_FIELDS.phone, employee.phone);
  setIfChanged(EMPLOYEE_FIELDS.maritalStatus, employee.maritalStatus);
  setIfChanged(EMPLOYEE_FIELDS.gender, employee.gender);
  setIfChanged(EMPLOYEE_FIELDS.birthDate, employee.birthDate);
  if (licenseNumber) setIfChanged(EMPLOYEE_FIELDS.licenseNumber, String(licenseNumber).trim());
  // תאריך תחילת עבודה: ממלאים רק אם הוא ריק — לעובד ותיק זהו התאריך המקורי ואין לדרוס אותו.
  if (employee.contractStartDate && stored && !stored[EMPLOYEE_FIELDS.workStartDate]) {
    empUpdate[EMPLOYEE_FIELDS.workStartDate] = employee.contractStartDate;
  }
  if (Object.keys(empUpdate).length > 0) {
    logger.info({ requestId, employeeId }, 'updating existing employee record');
    await updateRecord(TABLES.employees, employeeId, empUpdate, requestId);
  }
  return { employeeId, created: false, matchedByTz, matchedName };
}
