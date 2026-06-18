import { NextRequest, NextResponse } from 'next/server';
import { resolveInstitutionByToken } from '@/lib/institution';
import { listRecords } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS, SYMBOL_FIELDS } from '@/lib/airtable/schema';

export interface BudgetRow {
  id: string;
  role: string;
  category: string;
  scheduleType: string;
  layer: string[];
  remainingHours: number;
  remainingGemulim: number;
  remainingRoles: number;
  ofekChadash: boolean;
  paraBoard: boolean;
  symbolName: string;
}

function single(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) return String((v as Record<string, unknown>).name);
  if (Array.isArray(v)) return v.length ? single(v[0]) : '';
  return String(v);
}

function multi(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => single(x)).filter(Boolean);
  const s = single(v);
  return s ? [s] : [];
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const institution = await resolveInstitutionByToken(token);
  if (!institution) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { mosadId } = institution;

  // Fetch symbol names for lookup
  let symbolMap: Record<string, string> = {};
  try {
    const symbols = await listRecords(TABLES.institutionSymbols, {
      fields: [SYMBOL_FIELDS.symbolCode, SYMBOL_FIELDS.displayName],
    });
    for (const s of symbols) {
      symbolMap[s.id] = String(s.fields[SYMBOL_FIELDS.displayName] ?? s.fields[SYMBOL_FIELDS.symbolCode] ?? '');
    }
  } catch { /* symbol names are optional */ }

  // Fetch all budget records, filter by institution in-memory
  let allRecords;
  try {
    allRecords = await listRecords(TABLES.budget, {
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
        BUDGET_FIELDS.symbolLink,
        BUDGET_FIELDS.institutionLink,
      ],
    });
  } catch {
    return NextResponse.json({ error: 'שגיאה בטעינת תקציב' }, { status: 500 });
  }

  const rows: BudgetRow[] = allRecords
    .filter((r) => {
      const links = r.fields[BUDGET_FIELDS.institutionLink];
      if (!links) return false;
      const arr = Array.isArray(links) ? links : [links];
      return arr.some((v) => (typeof v === 'string' ? v : (v as Record<string, string>)?.id) === mosadId);
    })
    .map((r) => {
      const f = r.fields;
      const symLinks = Array.isArray(f[BUDGET_FIELDS.symbolLink]) ? f[BUDGET_FIELDS.symbolLink] as string[] : [];
      const symName = symLinks.length ? (symbolMap[symLinks[0]] ?? '') : '';
      return {
        id: r.id,
        role: single(f[BUDGET_FIELDS.role]),
        category: single(f[BUDGET_FIELDS.category]),
        scheduleType: single(f[BUDGET_FIELDS.scheduleType]),
        layer: multi(f[BUDGET_FIELDS.layer]),
        remainingHours: num(f[BUDGET_FIELDS.remainingHours]),
        remainingGemulim: num(f[BUDGET_FIELDS.remainingGemulim]),
        remainingRoles: num(f[BUDGET_FIELDS.remainingRoles]),
        ofekChadash: Boolean(f[BUDGET_FIELDS.ofekChadash]),
        paraBoard: Boolean(f[BUDGET_FIELDS.paraBoard]),
        symbolName: symName,
      };
    });

  return NextResponse.json({ rows });
}
