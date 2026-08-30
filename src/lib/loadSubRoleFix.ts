import 'server-only';
import { getRecord } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, EMPLOYEE_FIELDS, BUDGET_FIELDS } from '@/lib/airtable/schema';
import { existingSubRoleDocsFromFields } from '@/lib/employees';
import { suggestCanonicalSubRole } from '@/lib/subRole';

export interface SubRoleFixContext {
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
  /** הצעה קנונית, או '' כשאין ודאות ואז התפריט נפתח ריק. */
  suggestion: string;
  /** האם שורת התקציב של התקן בכלל מציגה תת-תפקיד. */
  showsSubRole: boolean;
  /** שכבת התקן. חטיבה מצומצמת לערכי הדרכה בלבד, כמו ב-RoleStep. */
  layer: string;
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
 * טוען את ההקשר למסך תיקון תת-תפקיד. מחזיר null כשהתקן לא נמצא או אינו שייך
 * למוסד (mosadName נבדק מול שם המוסד שהטוקן פותר אליו, אותו פרדיקט כמו
 * GET /api/positions).
 */
export async function loadSubRoleFix(
  positionId: string,
  institutionName: string,
  requestId?: string,
): Promise<SubRoleFixContext | null> {
  const position = await getRecord(TABLES.activePositions, positionId, requestId);
  if (!position) return null;
  const pf = position.fields;

  const mosadRaw = pf[POSITION_FIELDS.mosadNameText];
  const mosadNames = Array.isArray(mosadRaw) ? mosadRaw.map((v) => String(v)) : [strField(mosadRaw)];
  if (!mosadNames.includes(institutionName)) return null;

  const employeeId = linkIds(pf[POSITION_FIELDS.employeeLink])[0] ?? '';
  const employee = employeeId ? await getRecord(TABLES.employees, employeeId, requestId) : null;
  const empFields = employee?.fields ?? {};

  const roleId = linkIds(pf[POSITION_FIELDS.roleLink])[0];
  const budget = roleId ? await getRecord(TABLES.budget, roleId, requestId) : null;
  const showsSubRole = Boolean(budget?.fields[BUDGET_FIELDS.paraSubRoleList]);

  const currentSubRole = strField(pf[POSITION_FIELDS.subRole]);
  // המקורי הוא מקור האמת להצעה. הוא נכתב פעם אחת ע"י סקריפט הסימון ולא נדרס,
  // ולכן ההצעה נשארת יציבה גם אחרי שמישהו כבר שינה את תת-התפקיד עצמו.
  const originalSubRole = strField(pf[POSITION_FIELDS.subRoleOriginal]) || currentSubRole;

  return {
    positionId,
    employeeId,
    employeeName: strField(pf[POSITION_FIELDS.employeeNameText]),
    roleTitle: strField(pf[POSITION_FIELDS.roleTitleText]),
    mosadName: mosadNames[0] ?? '',
    originalSubRole,
    currentSubRole,
    fixStatus: strField(pf[POSITION_FIELDS.subRoleFixStatus]),
    suggestion: suggestCanonicalSubRole(originalSubRole) ?? '',
    showsSubRole,
    layer: strField(pf[POSITION_FIELDS.layer]),
    existingSubRoleDocs: existingSubRoleDocsFromFields(empFields),
    existingLicenseNumber: strField(empFields[EMPLOYEE_FIELDS.licenseNumber]),
  };
}
