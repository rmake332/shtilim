import 'server-only';
import { getRecord } from '@/lib/airtable/client';
import {
  TABLES,
  POSITION_FIELDS,
  EMPLOYEE_FIELDS,
  SCHEDULE_FIELDS,
} from '@/lib/airtable/schema';
import type { EmployeeData, RoleData, ScheduleData } from '@/lib/formTypes';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

function secondsToHhmm(s: unknown): string {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return '';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function strField(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return '';
    if (typeof first === 'object' && 'name' in (first as object)) return String((first as { name: unknown }).name);
    if (typeof first === 'object' && 'id' in (first as object)) return String((first as { id: unknown }).id);
    return String(first);
  }
  if (typeof v === 'object' && 'name' in (v as object)) return String((v as { name: unknown }).name);
  return String(v);
}

function linkIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id ?? '')).filter(Boolean);
}

function linkTitles(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    if (typeof x === 'object' && x !== null) {
      return ('name' in (x as object)) ? String((x as { name: unknown }).name) : '';
    }
    return '';
  }).filter(Boolean);
}

export interface PositionData {
  employee: EmployeeData;
  role: RoleData;
  schedule: ScheduleData;
}

/**
 * Load a position record directly from Airtable (no HTTP round-trip).
 * Returns null if the record does not exist.
 */
export async function loadPosition(
  positionId: string,
  requestId?: string,
): Promise<PositionData | null> {
  const pos = await getRecord(TABLES.activePositions, positionId, requestId);
  if (!pos) return null;

  const pf = pos.fields;

  const employeeIds = linkIds(pf[POSITION_FIELDS.employeeLink]);
  let empFields: Record<string, unknown> = {};
  if (employeeIds[0]) {
    const empRec = await getRecord(TABLES.employees, employeeIds[0], requestId);
    if (empRec) empFields = empRec.fields;
  }

  const employee: EmployeeData = {
    recordId: employeeIds[0] ?? null,
    name: strField(empFields[EMPLOYEE_FIELDS.name]),
    tz: strField(empFields[EMPLOYEE_FIELDS.tz]),
    address: strField(empFields[EMPLOYEE_FIELDS.address]),
    email: strField(empFields[EMPLOYEE_FIELDS.email]),
    gender: (strField(empFields[EMPLOYEE_FIELDS.gender]) || 'זכר') as EmployeeData['gender'],
    maritalStatus: strField(empFields[EMPLOYEE_FIELDS.maritalStatus]) as EmployeeData['maritalStatus'],
    childrenUnder14: (strField(pf[POSITION_FIELDS.childrenUnder14]) || '') as EmployeeData['childrenUnder14'],
    birthDate: strField(empFields[EMPLOYEE_FIELDS.birthDate]),
    ageHours: Number(empFields[EMPLOYEE_FIELDS.ageHours]) || 0,
    contractStartDate: strField(pf[POSITION_FIELDS.contractStartDate]),
    youthRulesAcknowledged: true,
    fatherPosition: Boolean(empFields[EMPLOYEE_FIELDS.fatherPosition]),
  };

  const roleIds = linkIds(pf[POSITION_FIELDS.roleLink]);
  const symbolIds = linkIds(pf[POSITION_FIELDS.symbolLink]);
  const gemulIds = linkIds(pf[POSITION_FIELDS.bonusesLink]);
  const extraRoleIds = linkIds(pf[POSITION_FIELDS.rolesLink]);

  const categoryRaw = pf[POSITION_FIELDS.category];
  const category = Array.isArray(categoryRaw) ? strField(categoryRaw[0]) : strField(categoryRaw);

  // In edit mode the budget row's "remaining" is already depleted by this position.
  // Add back the hours this position currently holds so the schedule step can validate
  // against the correct effective budget (remaining + what this position will release).
  const currentHours = Number(pf[POSITION_FIELDS.totalUtilizedHours]) || Number(pf[POSITION_FIELDS.weeklyHours]) || 0;

  const role: RoleData = {
    symbolId: symbolIds[0] ?? '',
    symbolLabel: strField(pf[POSITION_FIELDS.roleTitleText]),
    roleId: roleIds[0] ?? '',
    roleTitle: strField(pf[POSITION_FIELDS.roleTitleText]),
    category,
    scheduleType: null,
    remainingHours: currentHours,
    layer: strField(pf[POSITION_FIELDS.layer]),
    subRole: strField(pf[POSITION_FIELDS.subRole]),
    selectedGemulIds: gemulIds,
    selectedGemulTitles: linkTitles(pf[POSITION_FIELDS.bonusesLink]),
    selectedExtraRoleIds: extraRoleIds,
    selectedExtraRoleTitles: linkTitles(pf[POSITION_FIELDS.rolesLink]),
    paraBoard: false,
    ofekChadash: false,
    severeDisability: false,
    bellScheduleNums: [],
    salaryType: null,
    tariff: null,
    ranking: null,
    seniority: null,
  };

  const week: Record<string, { in: string; out: string }[]> = {};
  for (const day of DAY_KEYS) {
    const def = SCHEDULE_FIELDS[day];
    const shifts = def.in.map((inFld, idx) => ({
      in: secondsToHhmm(pf[inFld]),
      out: secondsToHhmm(pf[def.out[idx]]),
    })).filter((s) => s.in && s.out);
    week[day] = shifts;
  }

  const schedule: ScheduleData = {
    week,
    weeklyHours: Number(pf[POSITION_FIELDS.weeklyHours]) || 0,
    frontalHours: Number(pf[POSITION_FIELDS.frontalHours]) || 0,
    individualHours: Number(pf[POSITION_FIELDS.individualHours]) || 0,
    stayHoursInstitution: Number(pf[POSITION_FIELDS.stayHours]) || 0,
    stayHoursHome: Number(pf[POSITION_FIELDS.stayHoursHome]) || 0,
    severeDisabilityBonus: Number(pf[POSITION_FIELDS.severeDisabilityBonus]) || 0,
    jobPercent: 0,
    motherPosition: strField(pf[POSITION_FIELDS.motherPosition]) === 'כן',
    worksElsewherePara: Boolean(pf[POSITION_FIELDS.worksElsewherePara]),
    ofekRecordId: linkIds(pf[POSITION_FIELDS.ofekCalcLink])[0],
    ofekAllRolesRecordId: linkIds(pf[POSITION_FIELDS.ofekCalcAllRolesLink])[0],
    reductionReason: strField(pf[POSITION_FIELDS.conditionsWorseningReason]),
  };

  return { employee, role, schedule };
}
