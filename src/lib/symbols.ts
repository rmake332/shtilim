import 'server-only';
import { unstable_cache } from 'next/cache';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, BUDGET_FIELDS, SYMBOL_FIELDS } from '@/lib/airtable/schema';

export interface SymbolOption {
  id: string;
  label: string;
}

function recordLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : (x as any)?.id)).filter(Boolean);
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as any)) return String((v as any).name);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  return String(v);
}

/**
 * Symbols available for an institution. Cached per mosadId for 30 minutes —
 * symbol lists rarely change during a working session.
 */
export const getSymbolsForInstitution = unstable_cache(
  async (mosadId: string): Promise<SymbolOption[]> => {
    const formula = `FIND("${escapeFormulaValue(mosadId)}", ARRAYJOIN({mosadID}))`;
    const budget = await listRecords(TABLES.budget, { filterByFormula: formula });
    const symbolIds = new Set<string>();
    for (const r of budget) {
      if (recordLinks(r.fields[BUDGET_FIELDS.institutionLink]).includes(mosadId)) {
        recordLinks(r.fields[BUDGET_FIELDS.symbolLink]).forEach((id) => symbolIds.add(id));
      }
    }
    if (symbolIds.size === 0) return [];

    // Fetch only the symbol records we actually need (by RECORD_ID), not the whole table.
    const idFilter = `OR(${Array.from(symbolIds)
      .map((id) => `RECORD_ID()="${escapeFormulaValue(id)}"`)
      .join(',')})`;
    const symbols = await listRecords(TABLES.institutionSymbols, {
      filterByFormula: idFilter,
      maxRecords: 500,
      fields: [SYMBOL_FIELDS.displayName, SYMBOL_FIELDS.symbolCode, SYMBOL_FIELDS.institutionName],
    });
    const byId = new Map(symbols.map((s) => [s.id, s]));

    return Array.from(symbolIds).map((id) => {
      const rec = byId.get(id);
      const code = rec ? text(rec.fields[SYMBOL_FIELDS.symbolCode]) : '';
      const name = rec
        ? text(rec.fields[SYMBOL_FIELDS.displayName]) || text(rec.fields[SYMBOL_FIELDS.institutionName])
        : '';
      const label = [code, name].filter(Boolean).join(' — ') || id;
      return { id, label };
    });
  },
  ['symbols-for-institution'],
  { revalidate: 1800 },
);
