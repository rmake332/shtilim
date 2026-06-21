import 'server-only';
import { unstable_cache } from 'next/cache';
import { listRecords, escapeFormulaValue, type AirtableRecord } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS, CATEGORY } from '@/lib/airtable/schema';

/** A role (תקן) from תקציב התחלתי, shaped for the UI. */
export interface RoleOption {
  id: string;
  title: string;
  category: string;
  scheduleType: string | null;
  remainingHours: number;
  layer: string[]; // שכבה values present on the budget record (may be empty)
  bellScheduleNums: string[];
  ofekChadash: boolean;
  paraBoard: boolean;
  severeDisability: boolean;
  salaryType: string | null;
  tariff: string | null;
  ranking: string | null;
  seniority: string | null;
}

/** A selectable gemul / extra-role line (category = גמול / תפקידים, remaining > 0). */
export interface ExtraBudgetLine {
  id: string;
  title: string;
  /** For gemul lines: number of remaining gemulim (not hours). For roles lines: remaining count. */
  remainingCount: number;
}

function single(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.length ? single(v[0]) : null;
  return String(v);
}

function multi(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => single(x)).filter((x): x is string => !!x);
  const s = single(v);
  return s ? [s] : [];
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as any)?.id)).filter(Boolean);
}

interface MappedBudget extends RoleOption {
  remainingGemulim: number;
  remainingRoles: number;
}

function mapRole(r: AirtableRecord): MappedBudget {
  const f = r.fields;
  return {
    id: r.id,
    title: single(f[BUDGET_FIELDS.role]) ?? '',
    category: single(f[BUDGET_FIELDS.category]) ?? '',
    scheduleType: single(f[BUDGET_FIELDS.scheduleType]),
    remainingHours: num(f[BUDGET_FIELDS.remainingHours]),
    remainingGemulim: num(f[BUDGET_FIELDS.remainingGemulim]),
    remainingRoles: num(f[BUDGET_FIELDS.remainingRoles]),
    layer: multi(f[BUDGET_FIELDS.layer]),
    bellScheduleNums: multi(f[BUDGET_FIELDS.bellScheduleNum]),
    ofekChadash: Boolean(f[BUDGET_FIELDS.ofekChadash]),
    paraBoard: Boolean(f[BUDGET_FIELDS.paraBoard]),
    severeDisability: Boolean(single(f[BUDGET_FIELDS.severeDisabilityBonus]) === 'true' || f[BUDGET_FIELDS.severeDisabilityBonus] === true),
    salaryType: single(f[BUDGET_FIELDS.salaryType]),
    tariff: single(f[BUDGET_FIELDS.tariff]),
    ranking: single(f[BUDGET_FIELDS.ranking]),
    seniority: single(f[BUDGET_FIELDS.seniority]),
  };
}

/** All budget records linked to the institution, filtered in-memory by institutionLink.
 *  Cached per mosadId for 60 seconds so repeated role/symbol lookups within a session
 *  are instant. TTL is short enough that remainingHours stays reasonably fresh. */
const fetchBudgetForInstitution = unstable_cache(
  async (mosadId: string): Promise<AirtableRecord[]> => {
    const all = await listRecords(TABLES.budget, {
      fields: [
        BUDGET_FIELDS.role,
        BUDGET_FIELDS.category,
        BUDGET_FIELDS.scheduleType,
        BUDGET_FIELDS.remainingHours,
        BUDGET_FIELDS.remainingGemulim,
        BUDGET_FIELDS.remainingRoles,
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
    });
    return all.filter((r) => {
      const links = r.fields[BUDGET_FIELDS.institutionLink];
      if (!links) return false;
      const arr = Array.isArray(links) ? links : [links];
      return arr.some((v) => (typeof v === 'string' ? v : (v as any)?.id) === mosadId);
    });
  },
  ['budget-for-institution'],
  { revalidate: 60 },
);

/**
 * Selectable main roles for a given institution + symbol.
 * Excludes: empty scheduleType, OR category ∈ {גמול, גמולי פרא, תפקידים}.
 */
export async function getRoles(
  mosadId: string,
  symbolId: string,
): Promise<RoleOption[]> {
  const budget = await fetchBudgetForInstitution(mosadId);
  const excludedCats = new Set<string>([CATEGORY.gemul, CATEGORY.paraGemul, CATEGORY.roles]);

  return budget
    .filter((r) => recordLinks(r.fields[BUDGET_FIELDS.symbolLink]).includes(symbolId))
    .map(mapRole)
    .filter((role) => {
      if (!role.scheduleType) return false; // empty schedule type → hide
      if (excludedCats.has(role.category)) return false;
      return true;
    });
}

/** Gemul / extra-role lines (category match) with remaining > 0, for the institution.
 *  - גמול: filters by יתרת גמולים לניצול > 0
 *  - תפקידים: filters by יתרת תפקידים לניצול > 0
 *  No symbol filter — all lines across symbols for the institution are returned.
 */
export async function getExtraLines(
  mosadId: string,
  category: 'gemul' | 'roles',
): Promise<ExtraBudgetLine[]> {
  const budget = await fetchBudgetForInstitution(mosadId);
  const wanted: Set<string> =
    category === 'gemul'
      ? new Set([CATEGORY.gemul, CATEGORY.paraGemul])
      : new Set([CATEGORY.roles]);

  return budget
    .map(mapRole)
    .filter((r) => {
      if (!wanted.has(r.category)) return false;
      const remaining = category === 'gemul' ? r.remainingGemulim : r.remainingRoles;
      return remaining > 0;
    })
    .map((r) => ({
      id: r.id,
      title: r.title,
      remainingCount: category === 'gemul' ? r.remainingGemulim : r.remainingRoles,
    }));
}
