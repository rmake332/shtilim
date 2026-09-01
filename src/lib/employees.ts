import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, EMPLOYEE_FIELDS, POSITION_FIELDS, SUB_ROLE_DOC_FIELDS, DOC_FIELDS } from '@/lib/airtable/schema';
import { maskTz } from '@/lib/logger';
import { buildTzExactMatchFormula, cleanedTzField } from '@/lib/airtable/tzMatch';

/** Public, safe-to-return employee search result. ID is masked; no address/birthdate/full email leak. */
export interface EmployeeSearchResult {
  id: string;
  name: string;
  maskedTz: string;
}

/**
 * Search employees by ת.ז. only.
 * NOTE: רשימת עובדים is a network-wide table. We return only id + name + masked ID,
 * and require a minimum of 4 ID digits to avoid enumeration (security req #3).
 */
export async function searchEmployees(
  query: string,
  requestId?: string,
): Promise<EmployeeSearchResult[]> {
  // ID search only — strip non-digits and require at least 4 digits.
  const digits = query.replace(/\D/g, '');
  if (digits.length < 4) return [];

  // שני הצדדים מנוקים, אחרת עובד קיים לא עולה בחיפוש והמזכירה פותחת לו רשומה
  // כפולה: מהשדה המאוחסן מסירים מקפים/רווחים ("21872231-2"), ומהחיפוש אפסים
  // מובילים (חיפוש "054733068" מול ת.ז. שנשמרה "54733068"). הכיוון ההפוך מכוסה
  // ממילא כי זהו חיפוש תת-מחרוזת.
  const needle = digits.replace(/^0+/, '') || digits;
  const safe = escapeFormulaValue(needle);
  const formula = `FIND("${safe}", ${cleanedTzField(EMPLOYEE_FIELDS.tz)})`;

  const records = await listRecords(
    TABLES.employees,
    {
      filterByFormula: formula,
      maxRecords: 10,
      fields: [EMPLOYEE_FIELDS.name, EMPLOYEE_FIELDS.tz],
    },
    requestId,
  );

  return records.map((r) => ({
    id: r.id,
    name: String(r.fields[EMPLOYEE_FIELDS.name] ?? ''),
    maskedTz: maskTz(String(r.fields[EMPLOYEE_FIELDS.tz] ?? '')),
  }));
}

/** Full employee details for the edit form (returned only after explicit selection). */
export interface EmployeeDetails {
  id: string;
  name: string;
  tz: string;
  address: string;
  email: string;
  phone: string;
  gender: string;
  maritalStatus: string;
  birthDate: string;
  ageHours: number;
  fatherPosition: boolean;
  /** העסקה 12 שעות — מפעיל את מסלול ההפסקות של פנימיה (ראה schedule/breaks.ts). */
  twelveHourEmployment: boolean;
  licenseNumber: string;
  /** פרטי בנק + מספר עוסק — תקני חשבונית, "בקשת תשלום" בגוגל דוקס. */
  bankName: string;
  bankBranch: string;
  bankAccountNumber: string;
  vatNumber: string;
  /** SUB_ROLE_DOC_FIELDS.fieldId values that already have an attachment on file. */
  existingSubRoleDocs: string[];
  /** DOC_FIELDS.fieldId values (youth/role documents) that already have an attachment on file. */
  existingYouthDocs: string[];
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  return String(v);
}

function fieldIdsWithAttachment(fieldIds: string[], fields: Record<string, unknown>): string[] {
  return fieldIds
    .filter((fieldId, idx, arr) => arr.indexOf(fieldId) === idx) // dedupe (fieldId repeats when reused across defs)
    .filter((fieldId) => {
      const v = fields[fieldId];
      return Array.isArray(v) && v.length > 0;
    });
}

/** Which SUB_ROLE_DOC_FIELDS.fieldId values already have an attachment in a רשימת עובדים fields object. */
export function existingSubRoleDocsFromFields(fields: Record<string, unknown>): string[] {
  return fieldIdsWithAttachment(SUB_ROLE_DOC_FIELDS.map((d) => d.fieldId), fields);
}

/**
 * Which DOC_FIELDS.fieldId values (youth/role documents filed on the employee) already
 * have an attachment in a רשימת עובדים fields object. docEmployment is excluded — it's
 * filed on the position, not the employee.
 */
export function existingYouthDocsFromFields(fields: Record<string, unknown>): string[] {
  return fieldIdsWithAttachment(
    DOC_FIELDS.filter((d) => d.key !== 'docEmployment').map((d) => d.fieldId),
    fields,
  );
}

/** Fetch a single employee's full fields by record id (for the editable detail form). */
export async function getEmployeeById(
  recordId: string,
  requestId?: string,
): Promise<EmployeeDetails | null> {
  if (!/^rec[A-Za-z0-9]{6,}$/.test(recordId)) return null;
  const records = await listRecords(
    TABLES.employees,
    { filterByFormula: `RECORD_ID()="${escapeFormulaValue(recordId)}"`, maxRecords: 1 },
    requestId,
  );
  const r = records[0];
  if (!r) return null;
  const f = r.fields;
  const existingSubRoleDocs = existingSubRoleDocsFromFields(f);
  const existingYouthDocs = existingYouthDocsFromFields(f);
  return {
    id: r.id,
    name: str(f[EMPLOYEE_FIELDS.name]),
    tz: str(f[EMPLOYEE_FIELDS.tz]),
    address: str(f[EMPLOYEE_FIELDS.address]),
    email: str(f[EMPLOYEE_FIELDS.email]),
    phone: str(f[EMPLOYEE_FIELDS.phone]),
    gender: str(f[EMPLOYEE_FIELDS.gender]),
    maritalStatus: str(f[EMPLOYEE_FIELDS.maritalStatus]),
    birthDate: str(f[EMPLOYEE_FIELDS.birthDate]),
    ageHours: Number(f[EMPLOYEE_FIELDS.ageHours]) || 0,
    fatherPosition: Boolean(f[EMPLOYEE_FIELDS.fatherPosition]),
    twelveHourEmployment: Boolean(f[EMPLOYEE_FIELDS.twelveHourEmployment]),
    licenseNumber: str(f[EMPLOYEE_FIELDS.licenseNumber]),
    bankName: str(f[EMPLOYEE_FIELDS.bankName]),
    bankBranch: str(f[EMPLOYEE_FIELDS.bankBranch]),
    bankAccountNumber: str(f[EMPLOYEE_FIELDS.bankAccountNumber]),
    vatNumber: str(f[EMPLOYEE_FIELDS.vatNumber]),
    existingSubRoleDocs,
    existingYouthDocs,
  };
}

/**
 * Find an existing employee by EXACT ת.ז. (Israeli, normalized to 9 digits) or foreign
 * ID (passport/זיהוי זר, normalized without stripping letters — see buildTzExactMatchFormula).
 * Used to block creating a duplicate — if found, the existing employee is auto-selected.
 */
export async function findEmployeeByExactId(
  tz: string,
  requestId?: string,
): Promise<EmployeeSearchResult | null> {
  const formula = buildTzExactMatchFormula(tz, EMPLOYEE_FIELDS.tz);
  if (!formula) return null;

  // maxRecords גדול מ-1 בכוונה: בטבלה יש כבר כפילויות היסטוריות מהתקופה שבה
  // ההתאמה החמיצה צורות אחסון שונות. שולפים את כולן ובוחרים דטרמיניסטית את זו
  // שערכה המאוחסן זהה למה שהוקלד, כדי שאותה ת.ז. תמיד תוביל לאותה רשומה.
  const records = await listRecords(
    TABLES.employees,
    { filterByFormula: formula, maxRecords: 10, fields: [EMPLOYEE_FIELDS.name, EMPLOYEE_FIELDS.tz] },
    requestId,
  );
  if (records.length === 0) return null;
  const typed = String(tz).trim().replace(/[\s-]/g, '').toUpperCase();
  const clean = (v: unknown) => String(v ?? '').trim().replace(/[\s-]/g, '').toUpperCase();
  const r = records.find((rec) => clean(rec.fields[EMPLOYEE_FIELDS.tz]) === typed) ?? records[0];
  return {
    id: r.id,
    name: String(r.fields[EMPLOYEE_FIELDS.name] ?? ''),
    maskedTz: maskTz(String(r.fields[EMPLOYEE_FIELDS.tz] ?? '')),
  };
}

/**
 * "ילדים מתחת לגיל 14" כפי שכבר נענתה באחד מתקני העובד/ת הפעילים.
 *
 * השדה נשמר על התקן אך הוא עובדה ברמת העובד/ת: ממנו נגזרת "משרת אם", ומשרת אם
 * נקבעת לפי היקף ההעסקה הכולל ולכן חייבת לצאת זהה בכל תקני אותו עובד. תקן שנפתח
 * בלי התשובה נספר כ"לא", שולף שורת מחשבון אחרת מזו של יתר התקנים, ואז הפיצול
 * פרונטלי/שהייה של שני התקנים סוחף שעה בכל שמירה (בדיקה משולבת גורעת את שעות
 * התקן האחר משורה אחרת). לכן מסלול "הוספת תפקיד לעובד קיים" טוען את התשובה מכאן,
 * ורק כשאין ממה לטעון חוזר לשאול אותה בשלב פרטי העובד.
 *
 * מוחזרת התשובה מהתקן שהוגש אחרון; '' כשאין אף תקן עם תשובה.
 */
export async function childrenUnder14FromPositions(
  tz: string,
  requestId?: string,
): Promise<'' | 'כן' | 'לא'> {
  const trimmed = String(tz).trim();
  if (!trimmed) return '';
  // FIND על שדה ה-lookup (כמו ב-existingPositions), ואז השוואה מדויקת בזיכרון כדי
  // שת.ז. שהיא תת-מחרוזת של אחרת לא תגרור תשובה של עובד/ת אחר/ת.
  const records = await listRecords(
    TABLES.activePositions,
    {
      filterByFormula: `FIND("${escapeFormulaValue(trimmed)}", {${POSITION_FIELDS.tzLookup}})`,
      maxRecords: 50,
      fields: [POSITION_FIELDS.tzLookup, POSITION_FIELDS.childrenUnder14, POSITION_FIELDS.submittedAt],
    },
    requestId,
  );

  const answered = records
    .filter((r) => str(r.fields[POSITION_FIELDS.tzLookup]) === trimmed)
    .map((r) => ({
      value: str(r.fields[POSITION_FIELDS.childrenUnder14]),
      submittedAt: String(r.fields[POSITION_FIELDS.submittedAt] ?? ''),
    }))
    .filter((r) => r.value === 'כן' || r.value === 'לא')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return (answered[0]?.value as 'כן' | 'לא') ?? '';
}
