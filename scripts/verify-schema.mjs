/**
 * Verify every field ID in src/lib/airtable/schema.ts really exists on the table it is
 * declared under, and report which table an orphan ID actually belongs to.
 *
 * Why: fields with the SAME NAME exist on several tables (a doc field moved from
 * תקנים פעילים to רשימת עובדים keeps its name but gets a NEW id). Using the stale id
 * fails only at runtime — Airtable's upload endpoint answers 403
 * INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND, which reads like a token problem, not a typo.
 *
 * Usage: node scripts/verify-schema.mjs      (reads AIRTABLE_TOKEN / AIRTABLE_BASE_ID from .env.local)
 * Exits 1 when something doesn't line up.
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appKlvldLrk14ird8';
if (!TOKEN) {
  console.error('AIRTABLE_TOKEN is not set.');
  process.exit(1);
}

/** Which table each *_FIELDS block in schema.ts describes (by TABLES key). */
const BLOCK_TABLE = {
  MOSAD_FIELDS: 'mosadot',
  EMPLOYEE_FIELDS: 'employees',
  POSITION_FIELDS: 'activePositions',
  SCHEDULE_FIELDS: 'activePositions',
  BELL_FIELDS: 'bellSchedule',
  OFEK_FIELDS: 'ofekCalc',
  SYMBOL_FIELDS: 'institutionSymbols',
  BUDGET_FIELDS: 'budget',
  PREV_YEAR_FIELDS: 'prevYearPositions',
  HOURS_SUMMARY_FIELDS: 'hoursSummary',
};

const source = readFileSync('src/lib/airtable/schema.ts', 'utf8');

/** TABLES map: key → tblXXX */
const tables = {};
for (const m of source.matchAll(/^\s*(\w+):\s*'(tbl[A-Za-z0-9]{14})'/gm)) tables[m[1]] = m[2];

/** Field ids per block, keeping the property name for the report. */
const declared = [];
let block = null;
for (const line of source.split('\n')) {
  const start = /^export const (\w+)\s*=/.exec(line);
  if (start) block = start[1];
  if (!block || !BLOCK_TABLE[block]) continue;
  for (const m of line.matchAll(/(\w+)?:?\s*'(fld[A-Za-z0-9]{14})'/g)) {
    declared.push({ block, key: m[1] ?? '(inline)', fieldId: m[2] });
  }
}

const meta = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json());
if (!meta.tables) {
  console.error('meta request failed:', JSON.stringify(meta).slice(0, 300));
  process.exit(1);
}

/** fieldId → { table, name } across the whole base, plus per-table sets. */
const fieldHome = new Map();
const fieldsByTable = new Map();
for (const t of meta.tables) {
  fieldsByTable.set(t.id, new Map(t.fields.map((f) => [f.id, f])));
  for (const f of t.fields) fieldHome.set(f.id, { table: t.name, tableId: t.id, name: f.name });
}

const problems = [];
for (const d of declared) {
  const tableId = tables[BLOCK_TABLE[d.block]];
  const onTable = fieldsByTable.get(tableId)?.get(d.fieldId);
  if (onTable) continue;
  const home = fieldHome.get(d.fieldId);
  problems.push(
    `${d.block}.${d.key} (${d.fieldId}) — לא קיים בטבלה ${BLOCK_TABLE[d.block]}; ` +
      (home ? `יושב בפועל בטבלת "${home.table}" בשם "${home.name}"` : 'לא נמצא באף טבלה בבסיס'),
  );
}

console.log(`נבדקו ${declared.length} מזהי שדות מול ${meta.tables.length} טבלאות.`);
if (problems.length === 0) {
  console.log('הכל תקין.');
} else {
  console.log(`\n${problems.length} בעיות:`);
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
