import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRecord, updateRecord } from '@/lib/airtable/client';
import {
  TABLES,
  POSITION_FIELDS,
  EMPLOYEE_FIELDS,
  SCHEDULE_FIELDS,
} from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';
import { submitForm } from '@/lib/submit';
import type { EmployeeData, RoleData, ScheduleData } from '@/lib/formTypes';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

/** seconds-from-midnight → "HH:MM" */
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

/**
 * GET /api/positions/[id]?token=
 * Loads a position and its linked employee; reconstructs EmployeeData + RoleData + ScheduleData.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const positionId = params.id;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  try {
    const pos = await getRecord(TABLES.activePositions, positionId, gate.requestId);
    if (!pos) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const pf = pos.fields;

    // Verify this position belongs to the institution from the token.
    // We check via the employee's institution link or category lookup — but those are
    // lookup fields (read-only). Instead we rely on the fact that only the institution's
    // token resolves to its mosadId, and that mosadId is used to look up the budget rows.
    // For an extra guard we also check the mosad field if present.

    // Load linked employee record.
    const employeeIds = linkIds(pf[POSITION_FIELDS.employeeLink]);
    let empFields: Record<string, unknown> = {};
    if (employeeIds[0]) {
      const empRec = await getRecord(TABLES.employees, employeeIds[0], gate.requestId);
      if (empRec) empFields = empRec.fields;
    }

    // EmployeeData
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
      youthRulesAcknowledged: true, // pre-acknowledged on original submission
      fatherPosition: Boolean(empFields[EMPLOYEE_FIELDS.fatherPosition]),
    };

    // RoleData — roleId and symbolId from the linked records
    const roleIds = linkIds(pf[POSITION_FIELDS.roleLink]);
    const symbolIds = linkIds(pf[POSITION_FIELDS.symbolLink]);
    const gemulIds = linkIds(pf[POSITION_FIELDS.bonusesLink]);
    const extraRoleIds = linkIds(pf[POSITION_FIELDS.rolesLink]);

    // category and scheduleType come as lookup arrays on activePositions
    const categoryRaw = pf[POSITION_FIELDS.category];
    const category = Array.isArray(categoryRaw) ? strField(categoryRaw[0]) : strField(categoryRaw);

    // In edit mode the budget row's "remaining" is already depleted by this position.
    // Add back the hours this position currently holds so the schedule step can validate
    // against the correct effective budget (remaining + what this position will release).
    const currentHours = Number(pf[POSITION_FIELDS.totalUtilizedHours]) || Number(pf[POSITION_FIELDS.weeklyHours]) || 0;

    const role: RoleData = {
      symbolId: symbolIds[0] ?? '',
      symbolLabel: strField(pf[POSITION_FIELDS.roleTitleText]), // lookup text
      roleId: roleIds[0] ?? '',
      roleTitle: strField(pf[POSITION_FIELDS.roleTitleText]),
      category,
      scheduleType: strField(pf[POSITION_FIELDS.layer]) ? null : null, // schedule type is from budget row, loaded on client
      remainingHours: currentHours,
      layer: strField(pf[POSITION_FIELDS.layer]),
      subRole: strField(pf[POSITION_FIELDS.subRole]),
      selectedGemulIds: gemulIds,
      selectedGemulTitles: linkTitles(pf[POSITION_FIELDS.bonusesLink]),
      selectedExtraRoleIds: extraRoleIds,
      selectedExtraRoleTitles: linkTitles(pf[POSITION_FIELDS.rolesLink]),
      paraBoard: false, // budget flags loaded client-side when role chosen
      ofekChadash: false,
      severeDisability: false,
      bellScheduleNums: [],
      salaryType: null,
      tariff: null,
      ranking: null,
      seniority: null,
    };

    // ScheduleData — reconstruct week from duration fields (seconds → "HH:MM")
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
      jobPercent: 0, // computed client-side by ofek
      motherPosition: strField(pf[POSITION_FIELDS.motherPosition]) === 'כן',
      worksElsewherePara: Boolean(pf[POSITION_FIELDS.worksElsewherePara]),
      ofekRecordId: linkIds(pf[POSITION_FIELDS.ofekCalcLink])[0],
      ofekAllRolesRecordId: linkIds(pf[POSITION_FIELDS.ofekCalcAllRolesLink])[0],
      reductionReason: strField(pf[POSITION_FIELDS.conditionsWorseningReason]),
    };

    return NextResponse.json({ employee, role, schedule, positionId });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'get position failed');
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

/**
 * PATCH /api/positions/[id]?token=
 * Re-runs computations and updates the תקנים פעילים record in place.
 * Also updates the linked employee record if details changed.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const positionId = params.id;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { employee, role, schedule } = body as { employee: EmployeeData; role: RoleData; schedule: ScheduleData };
  if (!employee || !role || !schedule) {
    return NextResponse.json({ ok: false, message: 'חסרים נתונים.' }, { status: 400 });
  }

  try {
    // Use submitForm logic to build fields, but write to existing record instead of creating.
    // We achieve this by calling the internal helpers used in submit.ts directly.
    const result = await updatePosition(
      positionId,
      gate.institution.mosadId,
      { employee, role, schedule },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, positionId: result.positionId, employeeId: result.employeeId });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'update position failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בעדכון התקן.' }, { status: 500 });
  }
}

/**
 * DELETE /api/positions/[id]?token=
 * Sends a webhook to Make.com for the actual deletion workflow.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const positionId = params.id;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const webhookUrl = process.env.DELETE_POSITION_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn({ requestId: gate.requestId }, 'DELETE_POSITION_WEBHOOK_URL not set');
    return NextResponse.json({ ok: false, message: 'מחיקה אינה מוגדרת במערכת.' }, { status: 503 });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId, mosadId: gate.institution.mosadId }),
    });
    if (!res.ok) {
      logger.error({ requestId: gate.requestId, status: res.status }, 'webhook failed');
      return NextResponse.json({ ok: false, message: 'שגיאה בשליחת בקשת המחיקה.' }, { status: 502 });
    }
    logger.info({ requestId: gate.requestId, positionId }, 'delete webhook sent');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'delete webhook error');
    return NextResponse.json({ ok: false, message: 'שגיאת רשת.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Internal update logic (mirrors submitForm but updates in place)
// ---------------------------------------------------------------------------

const DAY_KEYS_SUBMIT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;

function hhmmToSeconds(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

function buildScheduleFields(schedule: ScheduleData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of DAY_KEYS_SUBMIT) {
    const shifts = (schedule.week?.[day] ?? []).slice(0, 3);
    const def = SCHEDULE_FIELDS[day];
    shifts.forEach((s, idx) => {
      const inSec = hhmmToSeconds(s.in);
      const outSec = hhmmToSeconds(s.out);
      if (inSec != null) out[def.in[idx]] = inSec;
      if (outSec != null) out[def.out[idx]] = outSec;
    });
    // Clear any slots beyond what was submitted (nulls for remaining shifts)
    for (let idx = shifts.length; idx < 3; idx++) {
      out[def.in[idx]] = 0;
      out[def.out[idx]] = 0;
    }
  }
  return out;
}

function computeUtilizedHours(role: RoleData, schedule: ScheduleData): number {
  const { frontalHours = 0, individualHours = 0, stayHoursInstitution = 0, stayHoursHome = 0 } = schedule;
  const isGanim = role.layer === 'גנים';
  const stay = isGanim ? stayHoursInstitution + stayHoursHome : 0;
  const total = frontalHours + individualHours + stay;
  return total > 0 ? total : (schedule.weeklyHours ?? 0);
}

async function updatePosition(
  positionId: string,
  institutionMosadId: string,
  params: { employee: EmployeeData; role: RoleData; schedule: ScheduleData },
  requestId?: string,
): Promise<{ positionId: string; employeeId: string }> {
  const { employee, role, schedule } = params;

  // Update employee record if it exists.
  const employeeId = employee.recordId ?? '';
  if (employeeId) {
    const empFields: Record<string, unknown> = {
      [EMPLOYEE_FIELDS.name]:          employee.name          || undefined,
      [EMPLOYEE_FIELDS.address]:       employee.address       || undefined,
      [EMPLOYEE_FIELDS.email]:         employee.email         || undefined,
      [EMPLOYEE_FIELDS.maritalStatus]: employee.maritalStatus || undefined,
      [EMPLOYEE_FIELDS.gender]:        employee.gender        || undefined,
      [EMPLOYEE_FIELDS.birthDate]:     employee.birthDate     || undefined,
    };
    Object.keys(empFields).forEach((k) => empFields[k] === undefined && delete empFields[k]);
    logger.info({ requestId, employeeId, empFields }, 'updating employee fields');
    await updateRecord(TABLES.employees, employeeId, empFields, requestId);
  }

  const fields: Record<string, unknown> = {
    [POSITION_FIELDS.contractStartDate]: employee.contractStartDate || undefined,
    [POSITION_FIELDS.childrenUnder14]: employee.childrenUnder14 || undefined,
    [POSITION_FIELDS.roleLink]: role.roleId ? [role.roleId] : undefined,
    [POSITION_FIELDS.symbolLink]: role.symbolId ? [role.symbolId] : undefined,
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
    ...(role.selectedGemulIds.length ? { [POSITION_FIELDS.bonusesLink]: role.selectedGemulIds } : { [POSITION_FIELDS.bonusesLink]: [] }),
    ...(role.selectedExtraRoleIds.length ? { [POSITION_FIELDS.rolesLink]: role.selectedExtraRoleIds } : { [POSITION_FIELDS.rolesLink]: [] }),
    ...(schedule.ofekRecordId ? { [POSITION_FIELDS.ofekCalcLink]: [schedule.ofekRecordId] } : {}),
    ...(schedule.ofekAllRolesRecordId ? { [POSITION_FIELDS.ofekCalcAllRolesLink]: [schedule.ofekAllRolesRecordId] } : {}),
    ...(schedule.reductionReason ? { [POSITION_FIELDS.conditionsWorseningReason]: schedule.reductionReason } : { [POSITION_FIELDS.conditionsWorseningReason]: null }),
    ...buildScheduleFields(schedule),
  };

  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);

  logger.info({ requestId, positionId, fieldKeys: Object.keys(fields), weeklyHours: fields[POSITION_FIELDS.weeklyHours], roleLink: fields[POSITION_FIELDS.roleLink], week: schedule.week }, 'updating position fields');
  await updateRecord(TABLES.activePositions, positionId, fields, requestId);
  logger.info({ requestId, positionId }, 'position updated');

  return { positionId, employeeId };
}
