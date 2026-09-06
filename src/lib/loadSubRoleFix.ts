import 'server-only';
import { getRecord, listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, EMPLOYEE_FIELDS, BUDGET_FIELDS, MOSAD_FIELDS } from '@/lib/airtable/schema';
import { existingSubRoleDocsFromFields } from '@/lib/employees';
import { suggestSubRole, type SubRoleOption } from '@/lib/subRole';
import { activeSubRoleOptions, subRoleDocFieldIds } from '@/lib/subRoleTable';

export interface SubRoleFixContext {
  /** טוקן המוסד, נגזר בשרת מהתקן עצמו ולעולם לא מגיע מה-URL. */
  token: string;
  positionId: string;
  employeeId: string;
  employeeName: string;
  roleTitle: string;
  mosadName: string;
  /** הערך הגולמי שנקלט משנה קודמת, מוקפא בשדה נפרד לפני התיקון. */
  originalSubRole: string;
  /** מה שיושב כרגע בשדה תת-תפקיד (בדרך כלל זהה למקורי, עד שמתקנים). */
  currentSubRole: string;
  /** 'דורש תיקון' / 'טופל' / '' */
  fixStatus: string;
  /** הצעה מטבלת תת-תפקידים, או '' כשאין ודאות ואז התפריט נפתח ריק. */
  suggestion: string;
  /** האופציות הפעילות מהטבלה, כדי שהרכיב לא יצטרך סיבוב נוסף לשרת. */
  subRoleOptions: SubRoleOption[];
  /** האם שורת התקציב של התקן בכלל מציגה תת-תפקיד. */
  showsSubRole: boolean;
  existingSubRoleDocs: string[];
  existingLicenseNumber: string;
}

function strField(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return '';
    if (typeof first === 'object' && 'name' in (first as object)) return String((first as { name: unknown }).name);
    return String(first);
  }
  if (typeof v === 'object' && 'name' in (v as object)) return String((v as { name: unknown }).name);
  return String(v);
}

function linkIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * טוען את ההקשר למסך תיקון תת-תפקיד לפי מזהה התקן בלבד.
 *
 * הטוקן **נגזר בשרת** משם המוסד של התקן ולא מתקבל ב-URL, כך שהקישור שניתן
 * להדביק בכפתור באיירטייבל לא חושף אותו (אותו דפוס כמו /form/from-prev-year/[id]).
 * הכתיבה עצמה עדיין עוברת דרך POST /api/positions/[id]/fix-subrole שמאמת את
 * הטוקן ואת בעלות המוסד על התקן.
 *
 * מחזיר null כשהתקן לא נמצא, כשאין לו שם מוסד, או כשהמוסד אינו פעיל בטפסים.
 */
export async function loadSubRoleFix(
  positionId: string,
  requestId?: string,
): Promise<SubRoleFixContext | null> {
  const position = await getRecord(TABLES.activePositions, positionId, requestId);
  if (!position) return null;
  const pf = position.fields;

  const mosadRaw = pf[POSITION_FIELDS.mosadNameText];
  const mosadNames = Array.isArray(mosadRaw) ? mosadRaw.map((v) => String(v)) : [strField(mosadRaw)];
  const mosadName = mosadNames.find((n) => n) ?? '';
  if (!mosadName) return null;

  // שם המוסד -> טוקן, בדיוק כמו ב-loadPrevYearFull. מוסד שאינו פעיל בטפסים חוסם.
  const mosadRecs = await listRecords(
    TABLES.mosadot,
    {
      filterByFormula: `AND({${MOSAD_FIELDS.name}}="${escapeFormulaValue(mosadName)}", {${MOSAD_FIELDS.formActive}}=TRUE())`,
      maxRecords: 1,
      fields: [MOSAD_FIELDS.formToken],
    },
    requestId,
  );
  const token = strField(mosadRecs[0]?.fields[MOSAD_FIELDS.formToken]);
  if (!token) return null;

  const employeeId = linkIds(pf[POSITION_FIELDS.employeeLink])[0] ?? '';
  const employee = employeeId ? await getRecord(TABLES.employees, employeeId, requestId) : null;
  const empFields = employee?.fields ?? {};

  const roleId = linkIds(pf[POSITION_FIELDS.roleLink])[0];
  const budget = roleId ? await getRecord(TABLES.budget, roleId, requestId) : null;
  const showsSubRole = Boolean(budget?.fields[BUDGET_FIELDS.paraSubRoleList]);

  const subRoleOptions = await activeSubRoleOptions();
  const currentSubRole = strField(pf[POSITION_FIELDS.subRole]);
  // המקורי הוא מקור האמת להצעה. הוא נכתב פעם אחת ע"י סקריפט הסימון ולא נדרס,
  // ולכן ההצעה נשארת יציבה גם אחרי שמישהו כבר שינה את תת-התפקיד עצמו.
  const originalSubRole = strField(pf[POSITION_FIELDS.subRoleOriginal]) || currentSubRole;

  return {
    token,
    positionId,
    employeeId,
    employeeName: strField(pf[POSITION_FIELDS.employeeNameText]),
    roleTitle: strField(pf[POSITION_FIELDS.roleTitleText]),
    mosadName,
    originalSubRole,
    currentSubRole,
    fixStatus: strField(pf[POSITION_FIELDS.subRoleFixStatus]),
    suggestion: suggestSubRole(originalSubRole, subRoleOptions.map((o) => o.name)) ?? '',
    subRoleOptions,
    showsSubRole,
    existingSubRoleDocs: existingSubRoleDocsFromFields(empFields, await subRoleDocFieldIds()),
    existingLicenseNumber: strField(empFields[EMPLOYEE_FIELDS.licenseNumber]),
  };
}
