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
        ...(licenseNumber ? { [EMPLOYEE_FIELDS.licenseNumber]: Number(licenseNumber) } : {}),
      },
      requestId,
    );
    logger.info({ requestId, employeeId: created.id }, 'employee record created');
    return { employeeId: created.id, created: true, matchedByTz: false };
  }

  // Existing employee — update any fields that were edited.
  const empUpdate: Record<string, unknown> = {};
  if (fullName)               empUpdate[EMPLOYEE_FIELDS.name]          = fullName;
  if (employee.address)       empUpdate[EMPLOYEE_FIELDS.address]       = employee.address;
  if (employee.email)         empUpdate[EMPLOYEE_FIELDS.email]         = employee.email;
  if (employee.phone)         empUpdate[EMPLOYEE_FIELDS.phone]         = employee.phone;
  if (employee.maritalStatus) empUpdate[EMPLOYEE_FIELDS.maritalStatus] = employee.maritalStatus;
  if (employee.gender)        empUpdate[EMPLOYEE_FIELDS.gender]        = employee.gender;
  if (employee.birthDate)     empUpdate[EMPLOYEE_FIELDS.birthDate]     = employee.birthDate;
  if (licenseNumber)          empUpdate[EMPLOYEE_FIELDS.licenseNumber] = Number(licenseNumber);
  // תאריך תחילת עבודה: ממלאים רק אם הוא ריק — לעובד ותיק זהו התאריך המקורי ואין לדרוס אותו.
  if (employee.contractStartDate) {
    const current = await getRecord(TABLES.employees, employeeId, requestId);
    if (current && !current.fields[EMPLOYEE_FIELDS.workStartDate]) {
      empUpdate[EMPLOYEE_FIELDS.workStartDate] = employee.contractStartDate;
    }
  }
  if (Object.keys(empUpdate).length > 0) {
    logger.info({ requestId, employeeId }, 'updating existing employee record');
    await updateRecord(TABLES.employees, employeeId, empUpdate, requestId);
  }
  return { employeeId, created: false, matchedByTz, matchedName };
}
