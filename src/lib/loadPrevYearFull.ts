import 'server-only';
import { getRecord, listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import {
  TABLES,
  PREV_YEAR_FIELDS,
  MOSAD_FIELDS,
  BUDGET_FIELDS,
  EMPLOYEE_FIELDS,
} from '@/lib/airtable/schema';
import { extractWeek, type PrevYearPosition } from '@/lib/prevYearPosition';
import { emptyRole, emptyEmployee, emptySchedule } from '@/lib/formTypes';
import type { EmployeeData, RoleData, ScheduleData } from '@/lib/formTypes';

export interface PrevYearFull {
  /** Resolved institution token (derived server-side from the prior-year row's mosad name). */
  token: string;
  /** Prefilled employee — when the ת.ז matched a רשימת עובדים record; null otherwise. */
  employee: EmployeeData | null;
  role: RoleData;
  schedule: ScheduleData;
  /** Full prior-year position — drives the prev-year summary in the schedule step. */
  prevYear: PrevYearPosition;
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== '' && !isNaN(n) ? n : null;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return '';
    if (typeof first === 'object' && 'name' in (first as object)) return String((first as { name: string }).name);
    return String(first);
  }
  if (typeof v === 'object' && 'name' in (v as object)) return String((v as { name: string }).name);
  return String(v);
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id ?? '')).filter(Boolean);
}

/**
 * Load a prior-year (תשפ"ו) position by its record id and shape it as a fully-prefilled
 * new-form payload: { token, employee, role, schedule }.
 *
 * The תשפ"ו row only carries TEXT (ת.ז, role name, category, mosad name, hours), so we
 * map back to תשפ"ז entities:
 *   • mosad name  → institution token (form_token on מוסדות, active only)
 *   • ת.ז         → רשימת עובדים record (employee.recordId); null if the employee isn't there yet
 *   • role+mosad  → תקציב התחלתי row → roleId (link target) + symbolId
 *   • day fields  → weekly schedule (extractWeek)
 *
 * Returns null when the institution can't be resolved (unknown / inactive token).
 */
export async function loadPrevYearFull(
  prevYearId: string,
  requestId?: string,
): Promise<PrevYearFull | null> {
  const row = await getRecord(TABLES.prevYearPositions, prevYearId, requestId);
  if (!row) return null;
  const pf = row.fields;

  const tz = normalize(str(pf[PREV_YEAR_FIELDS.tz]));
  const roleTitle = normalize(str(pf[PREV_YEAR_FIELDS.role]));
  const category = normalize(str(pf[PREV_YEAR_FIELDS.category]));
  const mosadName = normalize(str(pf[PREV_YEAR_FIELDS.mosad]));
  const subRole = str(pf[PREV_YEAR_FIELDS.subRole]);

  // 1) mosad name → active institution + token (server-derived; never from the client).
  if (!mosadName) return null;
  const mosadRecs = await listRecords(
    TABLES.mosadot,
    {
      filterByFormula: `AND({${MOSAD_FIELDS.name}}="${escapeFormulaValue(mosadName)}", {${MOSAD_FIELDS.formActive}}=TRUE())`,
      maxRecords: 1,
      fields: [MOSAD_FIELDS.name, MOSAD_FIELDS.formToken, MOSAD_FIELDS.layer],
    },
    requestId,
  );
  const mosad = mosadRecs[0];
  if (!mosad) return null;
  const token = str(mosad.fields[MOSAD_FIELDS.formToken]);
  if (!token) return null;
  const mosadId = mosad.id;
  const institutionLayer = str(mosad.fields[MOSAD_FIELDS.layer]);

  // 2) ת.ז → רשימת עובדים record (full employee details come from that table via lookups).
  let employee: EmployeeData | null = null;
  if (tz) {
    const digits = tz.replace(/\D/g, '');
    const empRecs = await listRecords(
      TABLES.employees,
      {
        filterByFormula: `OR({${EMPLOYEE_FIELDS.tz}}="${escapeFormulaValue(tz)}", {${EMPLOYEE_FIELDS.tz}}="${escapeFormulaValue(digits)}")`,
        maxRecords: 1,
      },
      requestId,
    );
    const e = empRecs[0];
    if (e) {
      const ef = e.fields;
      employee = {
        ...emptyEmployee(),
        recordId: e.id,
        name: str(ef[EMPLOYEE_FIELDS.name]),
        tz: str(ef[EMPLOYEE_FIELDS.tz]),
        address: str(ef[EMPLOYEE_FIELDS.address]),
        email: str(ef[EMPLOYEE_FIELDS.email]),
        gender: (str(ef[EMPLOYEE_FIELDS.gender]) || '') as EmployeeData['gender'],
        maritalStatus: (str(ef[EMPLOYEE_FIELDS.maritalStatus]) || '') as EmployeeData['maritalStatus'],
        birthDate: str(ef[EMPLOYEE_FIELDS.birthDate]),
        ageHours: Number(ef[EMPLOYEE_FIELDS.ageHours]) || 0,
        fatherPosition: Boolean(ef[EMPLOYEE_FIELDS.fatherPosition]),
        // childrenUnder14 / contractStartDate stay empty → secretary must fill them.
      };
    }
  }

  // 3) role name + category + mosad → תקציב התחלתי row → roleId (link) + symbolId.
  const role: RoleData = { ...emptyRole(), roleTitle, category, subRole };
  const budget = await listRecords(
    TABLES.budget,
    {
      filterByFormula: `{${BUDGET_FIELDS.role}}="${escapeFormulaValue(roleTitle)}"`,
      fields: [
        BUDGET_FIELDS.role,
        BUDGET_FIELDS.category,
        BUDGET_FIELDS.scheduleType,
        BUDGET_FIELDS.remainingHours,
        BUDGET_FIELDS.layer,
        BUDGET_FIELDS.bellScheduleNum,
        BUDGET_FIELDS.ofekChadash,
        BUDGET_FIELDS.paraBoard,
        BUDGET_FIELDS.severeDisabilityBonus,
        BUDGET_FIELDS.symbolLink,
        BUDGET_FIELDS.institutionLink,
        BUDGET_FIELDS.salaryType,
        BUDGET_FIELDS.tariff,
        BUDGET_FIELDS.ranking,
        BUDGET_FIELDS.seniority,
      ],
    },
    requestId,
  );
  const match = budget.find((r) => {
    const f = r.fields;
    if (!recordLinks(f[BUDGET_FIELDS.institutionLink]).includes(mosadId)) return false;
    if (normalize(str(f[BUDGET_FIELDS.category])) !== category) return false;
    return true;
  });
  if (match) {
    const f = match.fields;
    const layer = (Array.isArray(f[BUDGET_FIELDS.layer]) ? str((f[BUDGET_FIELDS.layer] as unknown[])[0]) : str(f[BUDGET_FIELDS.layer]));
    role.roleId = match.id;
    role.symbolId = recordLinks(f[BUDGET_FIELDS.symbolLink])[0] ?? '';
    role.symbolLabel = roleTitle;
    role.scheduleType = str(f[BUDGET_FIELDS.scheduleType]) || null;
    role.remainingHours = Number(f[BUDGET_FIELDS.remainingHours]) || 0;
    role.layer = layer || institutionLayer || '';
    role.paraBoard = Boolean(f[BUDGET_FIELDS.paraBoard]);
    role.ofekChadash = Boolean(f[BUDGET_FIELDS.ofekChadash]);
    role.severeDisability = Boolean(f[BUDGET_FIELDS.severeDisabilityBonus]);
    role.bellScheduleNums = Array.isArray(f[BUDGET_FIELDS.bellScheduleNum])
      ? (f[BUDGET_FIELDS.bellScheduleNum] as unknown[]).map((x) => str(x)).filter(Boolean)
      : [];
    role.salaryType = str(f[BUDGET_FIELDS.salaryType]) || null;
    role.tariff = str(f[BUDGET_FIELDS.tariff]) || null;
    role.ranking = str(f[BUDGET_FIELDS.ranking]) || null;
    role.seniority = str(f[BUDGET_FIELDS.seniority]) || null;
  }
  // No budget match (role retired this year) → role keeps text only; the form will ask
  // the secretary to pick a role in the role step.

  // 4) weekly schedule from the day fields + carry the prior-year row id for status update.
  const week = extractWeek(pf);
  const schedule: ScheduleData = {
    ...emptySchedule(),
    week,
    prevYearRecordId: prevYearId,
    // Empty when no budget row matched → any role chosen counts as "נוסף תקן חדש".
    prevYearRoleId: role.roleId || undefined,
  };

  const prevYear: PrevYearPosition = {
    recordId: prevYearId,
    week,
    subRole,
    notes: str(pf[PREV_YEAR_FIELDS.notes]),
    hoursForBudget: numOrNull(pf[PREV_YEAR_FIELDS.hoursForBudget]),
    frontalHours: numOrNull(pf[PREV_YEAR_FIELDS.frontalHours]),
    individualHours: numOrNull(pf[PREV_YEAR_FIELDS.individualHours]),
    stayHours: numOrNull(pf[PREV_YEAR_FIELDS.stayHours]),
  };

  return { token, employee, role, schedule, prevYear };
}
