#!/usr/bin/env node
/**
 * איחוד ערכי "מצב משפחתי" בטבלת "רשימת עובדים" לצורות הנייטרליות.
 *
 * רקע: השדה צבר לאורך השנים גם צורות ממוגדרות (נשוי/נשואה, גרוש/גרושה, אלמנה) וגם
 * צורות נייטרליות (רווק/ה, נשוי/ה). הסקריפט ממפה את הכל לארבע צורות נייטרליות.
 *
 * בטיחות הלוגיקה: הקוד בודק **רק** אם הערך מכיל "רווק" (showChildrenUnder14Question
 * ב-src/lib/formTypes.ts, ו-isMotherPosition ב-src/lib/schedule/ofek.ts). כל שאר
 * הערכים שקולים לחלוטין - "לא רווק/ה" - ולכן האיחוד אינו משנה אף חישוב: לא את שאלת
 * הילדים מתחת ל-14, לא את משרת אם, ולא את שורת מחשבון אופק שנשלפת.
 * נבדק גם שאף אוטומציה בבסיס אינה מאזינה לשדה.
 *
 * הרצה יבשה (ברירת מחדל, לא כותב כלום):
 *   node scripts/unify-marital-status.mjs
 * הרצה בפועל:
 *   node scripts/unify-marital-status.mjs --apply
 *
 * אחרי הרצה בפועל: הערכים הישנים יישארו ברשימת הבחירה של השדה בלי שאף רשומה
 * משתמשת בהם. יש למחוק אותם **ידנית** באיירטייבל - ה-API לא מוחק אופציות, והטופס
 * מושך את הרשימה חי ולכן ימשיך להציג אותן עד שיימחקו.
 *
 * בסיס: appKlvldLrk14ird8 (שתילים ירושלים)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ===== המיפוי - כל מה שצריך לערוך כדי לשנות את התוצאה =====
/** ערך מאוחסן -> הערך שיוחלף בו. ערך שאינו כאן לא ייגע. */
const MAPPING = {
  'נשוי': 'נשוי/ה',
  'נשואה': 'נשוי/ה',
  'גרוש': 'גרוש/ה',
  'גרושה': 'גרוש/ה',
  'אלמנה': 'אלמן/ה',
  'אלמן': 'אלמן/ה',
};
// ==========================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const text = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvLocal();

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
if (!BASE_ID || !TOKEN) throw new Error('AIRTABLE_BASE_ID / AIRTABLE_TOKEN חסרים ב-.env.local');

const TABLE_EMPLOYEES = 'tbl2jY3mzY279TsxU'; // רשימת עובדים
const FIELD_MARITAL = 'fld67gJC3ofqb4s8w'; // מצב משפחתי
const FIELD_NAME = 'fldM8uUGnWA0Q1EvT'; // שם העובד (לדיווח בלבד)

const APPLY = process.argv.includes('--apply');
const API = 'https://api.airtable.com/v0';

async function listAll(tableId, fieldIds) {
  const out = [];
  let offset;
  do {
    const p = new URLSearchParams();
    p.set('returnFieldsByFieldId', 'true');
    p.set('pageSize', '100');
    fieldIds.forEach((f) => p.append('fields[]', f));
    if (offset) p.set('offset', offset);
    const res = await fetch(`${API}/${BASE_ID}/${tableId}?${p}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`list ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    out.push(...json.records);
    offset = json.offset;
  } while (offset);
  return out;
}

/** עדכון בקבוצות של 10 (מגבלת ה-API). typecast מכוון: הערכים החדשים עדיין לא קיימים בשדה. */
async function patchBatch(tableId, records) {
  const res = await fetch(`${API}/${BASE_ID}/${tableId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, typecast: true }),
  });
  if (!res.ok) throw new Error(`patch ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const cell = (v) => (v == null ? '' : typeof v === 'object' ? String(v.name ?? '') : String(v));

async function main() {
  console.log(`מצב: ${APPLY ? '*** כתיבה בפועל (--apply) ***' : 'הרצה יבשה - לא נכתב כלום'}\n`);

  const employees = await listAll(TABLE_EMPLOYEES, [FIELD_MARITAL, FIELD_NAME]);

  const before = new Map();
  const planned = [];
  const untouched = new Map();

  for (const r of employees) {
    const current = cell(r.fields[FIELD_MARITAL]);
    before.set(current || '(ריק)', (before.get(current || '(ריק)') ?? 0) + 1);
    const target = MAPPING[current];
    if (!target || target === current) {
      untouched.set(current || '(ריק)', (untouched.get(current || '(ריק)') ?? 0) + 1);
      continue;
    }
    planned.push({ id: r.id, name: cell(r.fields[FIELD_NAME]), from: current, to: target });
  }

  console.log(`סה"כ ${employees.length} עובדים\n`);
  console.log('--- לפני ---');
  [...before.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

  const byChange = new Map();
  for (const p of planned) {
    const key = `${p.from} -> ${p.to}`;
    byChange.set(key, (byChange.get(key) ?? 0) + 1);
  }
  console.log(`\n--- ${planned.length} רשומות לשינוי ---`);
  [...byChange.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

  console.log('\n--- לא ישתנו ---');
  [...untouched.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

  console.log('\n--- 10 דוגמאות ---');
  planned.slice(0, 10).forEach((p) => console.log(`  ${p.id}  ${p.from.padEnd(7)} -> ${p.to.padEnd(7)}  ${p.name}`));

  const after = new Map(untouched);
  for (const p of planned) after.set(p.to, (after.get(p.to) ?? 0) + 1);
  console.log('\n--- אחרי ---');
  [...after.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

  if (!APPLY) {
    console.log('\n**לא נכתב כלום.** לביצוע בפועל: node scripts/unify-marital-status.mjs --apply');
    return;
  }
  if (planned.length === 0) {
    console.log('\nאין מה לעדכן.');
    return;
  }

  let done = 0;
  for (let i = 0; i < planned.length; i += 10) {
    const batch = planned.slice(i, i + 10).map((p) => ({ id: p.id, fields: { [FIELD_MARITAL]: p.to } }));
    await patchBatch(TABLE_EMPLOYEES, batch);
    done += batch.length;
    process.stdout.write(`\rעודכנו ${done}/${planned.length}`);
    // מגבלת 5 בקשות לשנייה לכל בסיס.
    await new Promise((r) => setTimeout(r, 220));
  }
  console.log(`\n\nהושלם: ${done} רשומות עודכנו.`);
  console.log('נותר ידנית: למחוק את הערכים הישנים מרשימת הבחירה של השדה באיירטייבל.');
}

main().catch((e) => {
  console.error('\nשגיאה:', e.message);
  process.exit(1);
});
