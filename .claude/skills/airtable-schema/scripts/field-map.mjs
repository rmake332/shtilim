/**
 * מיפוי סכימת Airtable מהיר: fieldId ↔ שם ↔ type, איתור טבלה/שדה לפי שם עברי,
 * וערכי choices ל-singleSelect/multipleSelects. מחליף את השליפות הידניות
 * החוזרות (קריאת tool-results + grep) בפקודה אחת.
 *
 * קורא AIRTABLE_TOKEN / AIRTABLE_BASE_ID מ-.env.local (כמו verify-schema.mjs).
 *
 * שימוש:
 *   node .claude/skills/airtable-schema/scripts/field-map.mjs                 # רשימת כל הטבלאות (key, tblId, שם, מס' שדות)
 *   node .claude/skills/airtable-schema/scripts/field-map.mjs activePositions # כל השדות בטבלה (לפי key מ-schema.ts, tblId, או שם עברי חלקי)
 *   node .claude/skills/airtable-schema/scripts/field-map.mjs "תקנים פעילים"  # אותו דבר לפי שם
 *   node .claude/skills/airtable-schema/scripts/field-map.mjs --find מוסד     # איתור כל השדות ששמם מכיל "מוסד" בכל הבסיס (+ באיזו טבלה)
 *   node .claude/skills/airtable-schema/scripts/field-map.mjs --id fldXXXX    # באיזו טבלה יושב fieldId מסוים ומה שמו
 *   node .claude/skills/airtable-schema/scripts/field-map.mjs activePositions --choices  # כולל ערכי choices לשדות בחירה
 */
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* אין .env.local (למשל סשן web) — נסתמך על משתני סביבה קיימים אם יש. */
}

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appKlvldLrk14ird8';
if (!TOKEN) {
  console.error(
    'AIRTABLE_TOKEN חסר. הרץ מקומית עם .env.local, או ייצא AIRTABLE_TOKEN בסביבה.\n' +
      'בסשן ללא הטוקן — השתמש בכלי ה-MCP של Airtable (list_tables_for_base / get_table_schema) במקום.',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const withChoices = args.includes('--choices');
const findIdx = args.indexOf('--find');
const idIdx = args.indexOf('--id');
const findText = findIdx >= 0 ? args[findIdx + 1] : null;
const findId = idIdx >= 0 ? args[idIdx + 1] : null;
const target = args.find((a) => !a.startsWith('--') && a !== findText && a !== findId);

/** TABLES map מ-schema.ts: key → tblId (כדי לאפשר חיפוש לפי ה-key שבקוד). */
let keyToTbl = {};
try {
  const src = readFileSync('src/lib/airtable/schema.ts', 'utf8');
  for (const m of src.matchAll(/^\s*(\w+):\s*'(tbl[A-Za-z0-9]{14})'/gm)) keyToTbl[m[1]] = m[2];
} catch {
  /* schema.ts לא חובה */
}

const meta = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json());
if (!meta.tables) {
  console.error('בקשת meta נכשלה:', JSON.stringify(meta).slice(0, 300));
  process.exit(1);
}

const fmtField = (f) => {
  let line = `  ${f.id}  ${String(f.type).padEnd(20)} ${f.name}`;
  if (withChoices && f.options?.choices) {
    line += '\n' + f.options.choices.map((c) => `      choice ${c.id} | ${c.name}`).join('\n');
  }
  return line;
};

// --id: איתור בית של fieldId
if (findId) {
  for (const t of meta.tables) {
    const f = t.fields.find((x) => x.id === findId);
    if (f) {
      console.log(`${findId} → טבלה "${t.name}" (${t.id}), שדה "${f.name}" [${f.type}]`);
      process.exit(0);
    }
  }
  console.log(`${findId} לא נמצא באף טבלה בבסיס.`);
  process.exit(1);
}

// --find: חיפוש שדות לפי שם בכל הבסיס
if (findText) {
  let hits = 0;
  for (const t of meta.tables) {
    const matches = t.fields.filter((f) => f.name.includes(findText));
    if (matches.length) {
      console.log(`\n■ ${t.name} (${t.id})`);
      for (const f of matches) {
        console.log(fmtField(f));
        hits++;
      }
    }
  }
  console.log(`\nסה"כ ${hits} התאמות ל-"${findText}".`);
  process.exit(0);
}

// טבלה ספציפית
if (target) {
  const tblId = keyToTbl[target] || target;
  const t = meta.tables.find(
    (x) => x.id === tblId || x.name === target || x.name.includes(target),
  );
  if (!t) {
    console.error(`לא נמצאה טבלה עבור "${target}". הרץ ללא ארגומנטים לרשימת הטבלאות.`);
    process.exit(1);
  }
  console.log(`■ ${t.name} (${t.id}) — ${t.fields.length} שדות\n`);
  for (const f of t.fields) console.log(fmtField(f));
  process.exit(0);
}

// ברירת מחדל: כל הטבלאות
const tblToKey = Object.fromEntries(Object.entries(keyToTbl).map(([k, v]) => [v, k]));
console.log(`בסיס ${BASE_ID} — ${meta.tables.length} טבלאות:\n`);
for (const t of meta.tables) {
  const key = tblToKey[t.id] ? `${tblToKey[t.id]} ` : '';
  console.log(`  ${t.id}  ${key.padEnd(22)} ${t.name}  (${t.fields.length} שדות)`);
}
