import 'server-only';
import { createRecord, updateRecord, listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import {
  TABLES,
  POSITION_FIELDS,
  PREV_YEAR_FIELDS,
  SCHEDULE_FIELDS,
  BREAK_FIELDS,
  BREAK_DAY_KEYS,
} from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';
import { notifyError } from '@/lib/makeWebhook';
import { upsertEmployee } from '@/lib/saveEmployee';
import { computeUtilizedHours } from '@/lib/schedule/ofek';
import { subRoleLinkFor } from '@/lib/subRoleTable';
import type { EmployeeData, RoleData, ScheduleData } from '@/lib/formTypes';

// Includes מוצ"ש — only populated for regular-type schedules; other types never set week.motzash.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'motzash'] as const;

/** A second submit for the same employee + role within this window is treated as an
 *  accidental double-submit (e.g. a slow first response made the secretary unsure it
 *  went through), not a genuine second position. */
const DUPLICATE_SUBMIT_WINDOW_MINUTES = 10;

/** Thrown when submitForm blocks an accidental double-submit. Callers should surface
 *  `message` to the user directly (with a link to `existingPositionId`'s edit form)
 *  rather than the generic save-failed error. */
export class DuplicateSubmissionError extends Error {
  constructor(public readonly existingPositionId: string) {
    super('קיים כבר תקן לעובד/ת זה בתפקיד זה.');
    this.name = 'DuplicateSubmissionError';
  }
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id ?? '')).filter(Boolean);
}

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
 * Persist the form. Creates a רשימת עובדים record if the employee is new,
 * then ONE תקנים פעילים record (status "ממתין לעדכון"). An Airtable automation
 * handles the הודעה לעובד downstream.
 */
export async function submitForm(
  params: {
    institutionMosadId: string;
    institutionName: string;
    employee: EmployeeData;
    role: RoleData;
    schedule: ScheduleData;
  },
  requestId?: string,
): Promise<{ positionId: string; employeeId: string }> {
  const { employee, role, schedule, institutionMosadId, institutionName } = params;

  // 1. Employee record (create if new, update if existing).
  // בדרך כלל הרשומה כבר נוצרה בסיום שלב פרטי העובד (POST /api/employees) והקריאה כאן
  // רק מעדכנת. הקריאה נשארת כי מסלולים אחרים (עריכה, טעינה משנה קודמת) מגיעים לכאן ישירות.
  const { employeeId } = await upsertEmployee(
    { employee, institutionMosadId, licenseNumber: role.licenseNumber },
    requestId,
  );

  // Guard against an accidental double-submit (e.g. the secretary wasn't sure the first
  // click went through, or a slow response looked like a failure, and sent the form again
  // moments later) — skip creating a second position for the same employee + role.
  if (role.roleId) {
    const recentPositions = await listRecords(
      TABLES.activePositions,
      {
        filterByFormula: `FIND("${escapeFormulaValue(employee.tz)}", {${POSITION_FIELDS.tzLookup}})`,
        maxRecords: 20,
      },
      requestId,
    );
    const dup = recentPositions.find((r) => {
      if (!recordLinks(r.fields[POSITION_FIELDS.roleLink]).includes(role.roleId!)) return false;
      const submittedAt = r.fields[POSITION_FIELDS.submittedAt];
      if (!submittedAt) return false;
      const ageMinutes = (Date.now() - new Date(String(submittedAt)).getTime()) / 60000;
      return ageMinutes >= 0 && ageMinutes < DUPLICATE_SUBMIT_WINDOW_MINUTES;
    });
    if (dup) {
      logger.warn({ requestId, existingPositionId: dup.id }, 'blocked duplicate submission');
      throw new DuplicateSubmissionError(dup.id);
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
    // dual-write בתקופת המעבר לטבלת תת-תפקידים: הקוד עדיין קורא מה-singleSelect,
    // אבל כל כתיבה ממלאת גם את שדה הקישור, כך שכשהמעבר יושלם השדה כבר מלא.
    // ערך שאינו בטבלה מקבל undefined ולא נכתב, במקום ליצור שורה חדשה בטבלה.
    [POSITION_FIELDS.subRoleLink]: await subRoleLinkFor(role.subRole),
    // שעות אלו נגזרות ישירות ממערכת השעות ותמיד מוגדרות (0 כברירת מחדל) — יש לכתוב
    // אותן תמיד, כולל כשהערך הוא 0, אחרת || undefined מדלג על השדה ב-Airtable משאיר
    // ערך ישן מעריכה קודמת (ראה fldOijiio8e3LTzr3 שנתקע על 5.5 אחרי מחיקת כל השעות).
    [POSITION_FIELDS.weeklyHours]: schedule.weeklyHours,
    [POSITION_FIELDS.totalUtilizedHours]: computeUtilizedHours(role.layer, schedule, role.scheduleType),
    [POSITION_FIELDS.motherPosition]: schedule.motherPosition ? 'כן' : 'לא',
    [POSITION_FIELDS.frontalHours]: schedule.frontalHours,
    [POSITION_FIELDS.individualHours]: schedule.individualHours,
    [POSITION_FIELDS.stayHours]: schedule.stayHoursInstitution,
    [POSITION_FIELDS.stayHoursHome]: schedule.stayHoursHome,
    [POSITION_FIELDS.severeDisabilityBonus]: schedule.severeDisabilityBonus,
    [POSITION_FIELDS.worksElsewherePara]: schedule.worksElsewherePara,
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
    ...(schedule.notes ? { [POSITION_FIELDS.notes]: schedule.notes } : {}),
    ...scheduleFields(schedule),
  };

  // Drop undefined keys.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  const position = await createRecord(TABLES.activePositions, fields, requestId);
  logger.info({ requestId, positionId: position.id }, 'position created (ממתין לעדכון)');

  // Mark the prior-year (תשפ"ו) source record.
  // Same role as last year → "הועלה תקן משנה קודמת"; a different role (or none resolved
  // from the budget, so the secretary picked another) → "נוסף תקן חדש".
  // Best-effort: the position above is already saved, so a failure here must not fail the
  // whole submission (the secretary would otherwise see an error despite success, and could
  // create a duplicate position by retrying). Failures are still surfaced to the developer.
  if (schedule.prevYearRecordId) {
    const sameRole = Boolean(schedule.prevYearRoleId) && schedule.prevYearRoleId === role.roleId;
    const status = sameRole ? 'הועלה תקן משנה קודמת' : 'נוסף תקן חדש';
    try {
      await updateRecord(
        TABLES.prevYearPositions,
        schedule.prevYearRecordId,
        { [PREV_YEAR_FIELDS.updateStatusTshapaz]: status },
        requestId,
      );
      logger.info({ requestId, prevYearRecordId: schedule.prevYearRecordId, status }, 'prev-year record marked');
    } catch (e) {
      logger.error(
        { requestId, prevYearRecordId: schedule.prevYearRecordId, err: String(e) },
        'prev-year status update failed',
      );
      await notifyError(
        {
          stage: 'airtable_write',
          name: employee.name,
          tz: employee.tz,
          role: role.roleTitle,
          institution: institutionName,
          detail: `עדכון סטטוס תשפ"ו נכשל עבור ${schedule.prevYearRecordId} (positionId ${position.id}): ${String(e)}`,
        },
        requestId,
      );
    }
  }

  // Youth-document attachments are uploaded by the client after submit, one request
  // per file (/api/upload-doc), to stay under the host's request-body size limit.
  return { positionId: position.id, employeeId };
}
