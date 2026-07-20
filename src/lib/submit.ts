import 'server-only';
import { createRecord, updateRecord, getRecord } from '@/lib/airtable/client';
import {
  TABLES,
  EMPLOYEE_FIELDS,
  POSITION_FIELDS,
  PREV_YEAR_FIELDS,
  SCHEDULE_FIELDS,
  BREAK_FIELDS,
  BREAK_DAY_KEYS,
} from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';
import { findEmployeeByExactId } from '@/lib/employees';
import type { EmployeeData, RoleData, ScheduleData } from '@/lib/formTypes';

// Includes מוצ"ש — only populated for regular-type schedules; other types never set week.motzash.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'motzash'] as const;

/** "HH:MM" → fractional hours for Airtable duration fields (stored as seconds). */
function hhmmToSeconds(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

/** Build the duration field map for the weekly schedule (3 shifts/day). */
function scheduleFields(schedule: ScheduleData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of DAY_KEYS) {
    const shifts = (schedule.week?.[day] ?? []).slice(0, 3);
    const def = SCHEDULE_FIELDS[day];
    shifts.forEach((s, idx) => {
      const inSec = hhmmToSeconds(s.in);
      const outSec = hhmmToSeconds(s.out);
      if (inSec != null) out[def.in[idx]] = inSec;
      if (outSec != null) out[def.out[idx]] = outSec;
    });
  }
  // הפסקה יומית — א'–ו' בלבד (למוצ"ש אין שדות באיירטייבל).
  for (const day of BREAK_DAY_KEYS) {
    const brk = schedule.breaks?.[day];
    if (!brk) continue;
    const inSec = hhmmToSeconds(brk.in);
    const outSec = hhmmToSeconds(brk.out);
    if (inSec != null) out[BREAK_FIELDS[day].in] = inSec;
    if (outSec != null) out[BREAK_FIELDS[day].out] = outSec;
  }
  return out;
}

/**
 * סה"כ שעות לניצול = frontal + individual + stay.
 * גנים (הוראה ופרא): כולל שהייה.
 * יסודי / חטיבה: ללא שהייה → frontal + individual בלבד.
 */
function computeUtilizedHours(role: RoleData, schedule: ScheduleData): number {
  const { frontalHours = 0, individualHours = 0, stayHoursInstitution = 0, stayHoursHome = 0 } = schedule;
  const isGanim = role.layer === 'גנים';
  const stay = isGanim ? stayHoursInstitution + stayHoursHome : 0;
  const total = frontalHours + individualHours + stay;
  // Fall back to weeklyHours when the ofek breakdown hasn't been computed yet.
  return total > 0 ? total : (schedule.weeklyHours ?? 0);
}

/**
 * Persist the form. Creates a רשימת עובדים record if the employee is new,
 * then ONE תקנים פעילים record (status "ממתין לעדכון"). An Airtable automation
 * handles the הודעה לעובד downstream.
 */
export async function submitForm(
  params: {
    institutionMosadId: string;
    employee: EmployeeData;
    role: RoleData;
    schedule: ScheduleData;
  },
  requestId?: string,
): Promise<{ positionId: string; employeeId: string }> {
  const { employee, role, schedule, institutionMosadId } = params;

  // 1. Employee record (create if new, update if existing).
  let employeeId = employee.recordId ?? '';
  if (!employeeId) {
    // Defense-in-depth: never create a duplicate. If the ID already exists, reuse it.
    const existing = await findEmployeeByExactId(employee.tz, requestId);
    if (existing) {
      logger.info({ requestId }, 'duplicate id on submit — reusing existing employee');
      employeeId = existing.id;
    }
  }
  if (!employeeId) {
    const created = await createRecord(
      TABLES.employees,
      {
        [EMPLOYEE_FIELDS.name]: employee.name,
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
        ...(role.licenseNumber ? { [EMPLOYEE_FIELDS.licenseNumber]: Number(role.licenseNumber) } : {}),
      },
      requestId,
    );
    employeeId = created.id;
  } else {
    // Existing employee — update any fields that were edited.
    const empUpdate: Record<string, unknown> = {};
    if (employee.name)          empUpdate[EMPLOYEE_FIELDS.name]          = employee.name;
    if (employee.address)       empUpdate[EMPLOYEE_FIELDS.address]       = employee.address;
    if (employee.email)         empUpdate[EMPLOYEE_FIELDS.email]         = employee.email;
    if (employee.phone)         empUpdate[EMPLOYEE_FIELDS.phone]         = employee.phone;
    if (employee.maritalStatus) empUpdate[EMPLOYEE_FIELDS.maritalStatus] = employee.maritalStatus;
    if (employee.gender)        empUpdate[EMPLOYEE_FIELDS.gender]        = employee.gender;
    if (employee.birthDate)     empUpdate[EMPLOYEE_FIELDS.birthDate]     = employee.birthDate;
    if (role.licenseNumber)     empUpdate[EMPLOYEE_FIELDS.licenseNumber] = Number(role.licenseNumber);
    // תאריך תחילת עבודה: ממלאים רק אם הוא ריק — לעובד ותיק זהו התאריך המקורי ואין לדרוס אותו.
    if (employee.contractStartDate) {
      const current = await getRecord(TABLES.employees, employeeId, requestId);
      if (current && !current.fields[EMPLOYEE_FIELDS.workStartDate]) {
        empUpdate[EMPLOYEE_FIELDS.workStartDate] = employee.contractStartDate;
      }
    }
    if (Object.keys(empUpdate).length > 0) {
      logger.info({ requestId, employeeId }, 'updating existing employee on new-position submit');
      await updateRecord(TABLES.employees, employeeId, empUpdate, requestId);
    }
  }

  // 2. תקנים פעילים record.
  const fields: Record<string, unknown> = {
    [POSITION_FIELDS.employeeLink]: [employeeId],
    [POSITION_FIELDS.employeeNameLink]: [employeeId], // also link in the "שם העובד" field

    [POSITION_FIELDS.roleLink]: role.roleId ? [role.roleId] : undefined,
    [POSITION_FIELDS.symbolLink]: role.symbolId ? [role.symbolId] : undefined,
    [POSITION_FIELDS.contractStartDate]: employee.contractStartDate || undefined,
    [POSITION_FIELDS.contractEndDate]: role.contractEndDate || undefined,
    [POSITION_FIELDS.childrenUnder14]: employee.childrenUnder14,
    [POSITION_FIELDS.layer]: role.layer || undefined,
    [POSITION_FIELDS.subRole]: role.subRole || undefined,
    [POSITION_FIELDS.weeklyHours]: schedule.weeklyHours || undefined,
    [POSITION_FIELDS.totalUtilizedHours]: computeUtilizedHours(role, schedule) || undefined,
    [POSITION_FIELDS.motherPosition]: schedule.motherPosition ? 'כן' : 'לא',
    [POSITION_FIELDS.frontalHours]: schedule.frontalHours || undefined,
    [POSITION_FIELDS.individualHours]: schedule.individualHours || undefined,
    [POSITION_FIELDS.stayHours]: schedule.stayHoursInstitution || undefined,
    [POSITION_FIELDS.stayHoursHome]: schedule.stayHoursHome || undefined,
    [POSITION_FIELDS.severeDisabilityBonus]: schedule.severeDisabilityBonus || undefined,
    [POSITION_FIELDS.worksElsewherePara]: schedule.worksElsewherePara || undefined,
    [POSITION_FIELDS.updateStatus]: 'ממתין לעדכון',
    [POSITION_FIELDS.submittedAt]: new Date().toISOString(),
    ...(role.selectedGemulIds.length ? { [POSITION_FIELDS.bonusesLink]: role.selectedGemulIds } : {}),
    ...(role.selectedExtraRoleIds.length ? { [POSITION_FIELDS.rolesLink]: role.selectedExtraRoleIds } : {}),
    ...(schedule.ofekRecordId ? { [POSITION_FIELDS.ofekCalcLink]: [schedule.ofekRecordId] } : {}),
    ...(schedule.ofekAllRolesRecordId
      ? { [POSITION_FIELDS.ofekCalcAllRolesLink]: [schedule.ofekAllRolesRecordId] }
      : {}),
    ...(schedule.reductionReason ? { [POSITION_FIELDS.conditionsWorseningReason]: schedule.reductionReason } : {}),
    ...(role.hasMinistryFile ? { [POSITION_FIELDS.hasMinistryFile]: role.hasMinistryFile } : {}),
    ...scheduleFields(schedule),
  };

  // Drop undefined keys.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  const position = await createRecord(TABLES.activePositions, fields, requestId);
  logger.info({ requestId, positionId: position.id }, 'position created (ממתין לעדכון)');

  // Mark the prior-year (תשפ"ו) source record.
  // Same role as last year → "הועלה תקן משנה קודמת"; a different role (or none resolved
  // from the budget, so the secretary picked another) → "נוסף תקן חדש".
  if (schedule.prevYearRecordId) {
    const sameRole = Boolean(schedule.prevYearRoleId) && schedule.prevYearRoleId === role.roleId;
    const status = sameRole ? 'הועלה תקן משנה קודמת' : 'נוסף תקן חדש';
    await updateRecord(
      TABLES.prevYearPositions,
      schedule.prevYearRecordId,
      { [PREV_YEAR_FIELDS.updateStatusTshapaz]: status },
      requestId,
    );
    logger.info({ requestId, prevYearRecordId: schedule.prevYearRecordId, status }, 'prev-year record marked');
  }

  // Youth-document attachments are uploaded by the client after submit, one request
  // per file (/api/upload-doc), to stay under the host's request-body size limit.
  return { positionId: position.id, employeeId };
}
