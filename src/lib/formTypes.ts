/** Shared form state types for the multi-step wizard. */

import type { Day } from '@/lib/schedule/time';
import { SUB_ROLE_DOC_FIELDS, type SubRoleDocDef } from '@/lib/airtable/schema';
export type { Day };

export type Gender = 'זכר' | 'נקבה';
export type GenderUnset = Gender | '';
export type MaritalStatus = 'רווק/ה' | 'נשוי/ה' | 'גרוש/ה' | 'אלמן/ה';
export type YesNo = 'כן' | 'לא';
/** ילדים מתחת 14: starts unset ('') to force an explicit choice; never submitted empty. */
export type YesNoUnset = YesNo | '';

/**
 * A document picked for upload. Held as base64 in form state so it can be sent to
 * the Airtable upload-attachment endpoint after the position record is created.
 */
export interface UploadedDoc {
  filename: string;
  contentType: string;
  /** base64-encoded file contents (no data: prefix). */
  base64: string;
}

/** Document attachments keyed by DOC_FIELDS.key. */
export type YouthDocs = Record<string, UploadedDoc | undefined>;

/** Whole years between a birth date (YYYY-MM-DD) and a reference date (default: now). */
export function ageFromBirthDate(birthDate: string, ref: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const birth = new Date(y, mo - 1, d);
  // Reject overflow (e.g. Feb 30 rolling into March).
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== d) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    ref.getMonth() < birth.getMonth() ||
    (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const PARA_OR_TEACHING_CATEGORIES = new Set(['פרא רפואי', 'הוראה']);

/**
 * Whether a document field should be shown, given its condition + current form data.
 * Pure so it can run on the employee step and server-side. `layer` here is the
 * INSTITUTION's layer (from the token), not the role's.
 * `menoExcluded`: when true, never shown for institutions whose layer is מעון
 * (police / no-sex-offense and no-violence certs are not requested there).
 */
export function isDocVisible(
  condition: 'youth' | 'male' | 'kindergartenLayer' | 'newEmployeeParaOrTeaching',
  ctx: { birthDate?: string; gender?: GenderUnset; layer?: string; isNewEmployee?: boolean; category?: string },
  menoExcluded = false,
): boolean {
  if (menoExcluded && ctx.layer === 'מעון') return false;
  switch (condition) {
    case 'youth': {
      const age = ageFromBirthDate(ctx.birthDate ?? '');
      // "ages 15–18": completed age 15, 16, or 17 (>=15, exclusive of 18).
      return age != null && age >= 15 && age < 18;
    }
    case 'male':
      return ctx.gender === 'זכר';
    case 'kindergartenLayer':
      return ctx.layer === 'גנים';
    case 'newEmployeeParaOrTeaching':
      return Boolean(ctx.isNewEmployee) && PARA_OR_TEACHING_CATEGORIES.has(ctx.category ?? '');
  }
}

/** Document/license requirements for a given תת-תפקיד (empty array if none apply). */
export function subRoleDocsFor(subRole: string): readonly SubRoleDocDef[] {
  if (!subRole) return [];
  return SUB_ROLE_DOC_FIELDS.filter((d) => d.subRole === subRole);
}

/** Under 16 → employment forbidden during the school year (warning). */
export function isUnder16(birthDate: string): boolean {
  const age = ageFromBirthDate(birthDate);
  return age != null && age < 16;
}

/** Ages 15–17 (>=15, <18) → youth working-hours rules apply. */
export function isYouthHoursAge(birthDate: string): boolean {
  const age = ageFromBirthDate(birthDate);
  return age != null && age >= 15 && age < 18;
}

/** Step 1 — selected or newly-entered employee. */
export interface EmployeeData {
  /** Airtable record id if an existing employee was chosen; null if new. */
  recordId: string | null;
  name: string;
  tz: string;
  address: string;
  email: string;
  /** טלפון — required; must pass Israeli phone validation. */
  phone: string;
  gender: GenderUnset;
  maritalStatus: MaritalStatus | '';
  childrenUnder14: YesNoUnset;
  birthDate: string; // YYYY-MM-DD
  /** שעות גיל — from רשימת עובדים for existing employees; derived from age otherwise. */
  ageHours: number;
  /** Required at step 1 regardless of new/existing. */
  contractStartDate: string;
  /**
   * Confirmation that the secretary read the youth-employment rules. UI gate only
   * (not written to Airtable); required to continue when the employee is a minor.
   */
  youthRulesAcknowledged: boolean;
  /** משרת אב — adds 2 extra hours to entered hours in all schedule calculations. */
  fatherPosition: boolean;
  /**
   * Which SUB_ROLE_DOC_FIELDS.fieldId keys are already on file for this employee
   * (from רשימת עובדים), fetched when an existing employee is loaded. Used to skip
   * re-requesting a document that's already attached. Empty for a new employee.
   */
  existingSubRoleDocs: string[];
  /** מס' רישיון already on file for this employee (from רשימת עובדים); '' for a new employee. */
  existingLicenseNumber: string;
  /**
   * Which DOC_FIELDS.fieldId keys (youth/role documents) are already on file for this
   * employee (from רשימת עובדים). Used to skip re-requesting a document that's already
   * attached. Empty for a new employee.
   */
  existingYouthDocs: string[];
}

/** Step 2 — role selection. */
export interface RoleData {
  symbolId: string;
  symbolLabel: string;
  roleId: string;
  roleTitle: string;
  category: string;
  scheduleType: string | null;
  remainingHours: number;
  /** Final layer: from budget if present, else manually chosen. */
  layer: string;
  /** תת-תפקיד: יסודי → רשימה מלאה, חטיבה → מסונן ל"הדרכה...", גנים → לא מוצג. */
  subRole: string;
  /**
   * אישור אפרת ולנדברג למטפל/ת רגשית או מטפל/ת באומנות. שער UI בלבד (לא נשמר
   * לאיירטייבל); "לא" חוסם המשך.
   */
  landbergApproval: YesNoUnset;
  selectedGemulIds: string[];
  selectedGemulTitles: string[];
  selectedExtraRoleIds: string[];
  selectedExtraRoleTitles: string[];
  /** Budget flags needed by step-3 calculations. */
  paraBoard: boolean;
  ofekChadash: boolean;
  severeDisability: boolean;
  bellScheduleNums: string[];
  /** Salary / ranking info from תקציב התחלתי — display only. */
  salaryType: string | null;
  tariff: string | null;
  ranking: string | null;
  seniority: string | null;
  /** האם קיים תיק במשרד החינוך — רלוונטי לעובד חדש בפרא/הוראה. */
  hasMinistryFile: YesNoUnset;
  /** מס' רישיון — required when subRole is קלינאות תקשורת / ריפוי בעיסוק; '' until entered. */
  licenseNumber: string;
  /** תאריך סיום העסקה — required when category is "מילוי מקום לתקופה מוגבלת" (YYYY-MM-DD). */
  contractEndDate: string;
}

export function emptyRole(): RoleData {
  return {
    symbolId: '',
    symbolLabel: '',
    roleId: '',
    roleTitle: '',
    category: '',
    scheduleType: null,
    remainingHours: 0,
    layer: '',
    subRole: '',
    landbergApproval: '',
    selectedGemulIds: [],
    selectedGemulTitles: [],
    selectedExtraRoleIds: [],
    selectedExtraRoleTitles: [],
    paraBoard: false,
    ofekChadash: false,
    severeDisability: false,
    bellScheduleNums: [],
    salaryType: null,
    tariff: null,
    ranking: null,
    seniority: null,
    hasMinistryFile: '',
    licenseNumber: '',
    contractEndDate: '',
  };
}

/** Step 3 — weekly schedule + computed hours. */
export interface ShiftData {
  in: string;
  out: string;
}
export interface ScheduleData {
  /** week[day] = up to 3 shifts. day keys: sun..fri */
  week: Record<string, ShiftData[]>;
  /** Final weekly hours used against budget. */
  weeklyHours: number;
  frontalHours: number;
  individualHours: number;
  stayHoursInstitution: number;
  stayHoursHome: number;
  severeDisabilityBonus: number;
  jobPercent: number;
  motherPosition: boolean;
  /** For deputy-1: 37.5 or 40; for manager/deputy-2: manual weekly total. */
  manualWeeklyHours?: number;
  worksElsewherePara: boolean;
  /** Ofek calculator record ids for linking on save. */
  ofekRecordId?: string;
  ofekAllRolesRecordId?: string;
  /** Reason for hours reduction vs. previous year (if applicable). */
  reductionReason?: string;
  /** תאריך עדכון מערכת — edit mode only (YYYY-MM-DD). */
  systemUpdateDate?: string;
  /** סיבת עדכון — edit mode only (one of UPDATE_REASON_OPTIONS). */
  updateReason?: string;
  /** Record id of the תקנים תשפו row that was loaded — set when user chose "טען מהשנה הקודמת". */
  prevYearRecordId?: string;
  /** The roleId that the prior-year row resolved to (from-prev-year flow). Compared at submit
   *  against the role actually saved: same → "הועלה תקן משנה קודמת", different/empty → "נוסף תקן חדש". */
  prevYearRoleId?: string;
  /**
   * For צהריים roles: the one day per week when the employee works a morning shift
   * (starts before 12:00). All other days must start at 12:00 or later.
   */
  morningDay?: Day;
}

export function emptySchedule(): ScheduleData {
  return {
    week: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [] },
    weeklyHours: 0,
    frontalHours: 0,
    individualHours: 0,
    stayHoursInstitution: 0,
    stayHoursHome: 0,
    severeDisabilityBonus: 0,
    jobPercent: 0,
    motherPosition: false,
    worksElsewherePara: false,
  };
}

export function emptyEmployee(): EmployeeData {
  return {
    recordId: null,
    name: '',
    tz: '',
    address: '',
    email: '',
    phone: '',
    gender: '',
    maritalStatus: '',
    childrenUnder14: '',
    birthDate: '',
    ageHours: 0,
    contractStartDate: '',
    youthRulesAcknowledged: false,
    fatherPosition: false,
    existingSubRoleDocs: [],
    existingLicenseNumber: '',
    existingYouthDocs: [],
  };
}
