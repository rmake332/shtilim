/**
 * דיבוג מפתח מחשבון אופק חדש: בונה את מפתח החיפוש (סיכום) בדיוק כמו buildOfekKey,
 * ומחפש אותו בטבלת "מחשבון אופק חדש". כשלא נמצא — בודק את המפתח עם משרת-אם ההפוכה
 * (המלכודת שה-route מטפל בה) ומדווח אם דווקא הוא קיים.
 *
 * מפתח = {שכבה}{שעות_גיל}{כן|לא}{קטגוריה}{סך_שעות}   לדוגמה: "חטיבה0כןהוראה5"
 * קטגוריה ∈ פרא | הוראה | הוראה_ללא_שהייה (נגזרת מ-scheduleType, לא מהקטגוריה בקוד).
 *
 * קורא AIRTABLE_TOKEN / AIRTABLE_BASE_ID מ-.env.local (כמו verify-schema.mjs).
 *
 * שימוש:
 *   node .claude/skills/ofek-key-debug/scripts/ofek-key.mjs --layer יסודי --age 0 --mother לא --category הוראה --hours 30
 *   node .claude/skills/ofek-key-debug/scripts/ofek-key.mjs --layer גנים --age 0 --mother כן --schedule-type "הוראה ללא שהייה" --hours 22
 *   node .claude/skills/ofek-key-debug/scripts/ofek-key.mjs --key "חטיבה0כןהוראה5"   # חיפוש מפתח מוכן
 */
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* אין .env.local */
}

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appKlvldLrk14ird8';
const OFEK_TABLE = 'tbluSqfzeX9Ns452y'; // מחשבון אופק חדש
const KEY_FIELD = 'fldbLwWMO4KFfo7KY'; // סיכום (lookup key)
if (!TOKEN) {
  console.error('AIRTABLE_TOKEN חסר. הרץ מקומית עם .env.local, או השתמש בכלי MCP של Airtable.');
  process.exit(1);
}

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

/** מיפוי scheduleType → קטגוריית אופק, זהה ל-ofekCategoryFor ב-ofek.ts. */
function ofekCategoryFor(st) {
  if (st === 'פרא') return 'פרא';
  if (st === 'הוראה' || st === 'הוראה - לוח פרא') return 'הוראה';
  if (st === 'הוראה ללא שהייה') return 'הוראה_ללא_שהייה';
  return null;
}

/** buildOfekKey מ-ofek.ts. */
const buildKey = ({ layer, age, mother, category, hours }) =>
  `${layer}${age}${mother ? 'כן' : 'לא'}${category}${hours}`;

async function lookup(key) {
  const formula = `{${KEY_FIELD}}="${key.replace(/"/g, '\\"')}"`;
  const url =
    `https://api.airtable.com/v0/${BASE_ID}/${OFEK_TABLE}` +
    `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const json = await res.json();
  if (!res.ok) {
    console.error('בקשה נכשלה:', JSON.stringify(json).slice(0, 300));
    process.exit(1);
  }
  return json.records?.[0] || null;
}

const printRow = (r) => {
  const f = r.fields;
  const val = (id) => f[id] ?? '—';
  console.log(`    recordId          ${r.id}`);
  console.log(`    frontalHours      ${val('fldg22XX78vV8T436')}`);
  console.log(`    individualHours   ${val('fld7yMvggoR6NFIqk')}`);
  console.log(`    stayHours         ${val('fldD3FoN1K5VgZHsR')}`);
  console.log(`    totalHours        ${val('fldrFRAYPc479uPeR')}`);
  console.log(`    jobPercent        ${val('fldYr6bOHs7wgJoko')}`);
};

// מפתח מוכן, או בנייה מרכיבים
let key = get('--key');
let motherBool;
if (!key) {
  const layer = get('--layer');
  const age = get('--age') ?? '0';
  const motherRaw = (get('--mother') ?? 'לא').toLowerCase();
  motherBool = motherRaw === 'כן' || motherRaw === 'true' || motherRaw === '1';
  const st = get('--schedule-type');
  let category = get('--category');
  if (st) category = ofekCategoryFor(st);
  const hours = get('--hours');
  if (!layer || !category || hours === undefined) {
    console.error('חסר --layer / --category (או --schedule-type) / --hours. או השתמש ב---key ישירות.');
    process.exit(1);
  }
  key = buildKey({ layer, age, mother: motherBool, category, hours });
}

console.log(`■ מפתח: "${key}"`);
const row = await lookup(key);
if (row) {
  console.log('  ✓ נמצא במחשבון:');
  printRow(row);
  process.exit(0);
}

console.log('  ✗ לא נמצא במחשבון.');

// מלכודת משרת-אם ההפוכה: אם בנינו מרכיבים, ננסה את המפתח ההפוך
if (motherBool !== undefined && !get('--key')) {
  const flippedKey = key.replace(motherBool ? 'כן' : 'לא', motherBool ? 'לא' : 'כן');
  if (flippedKey !== key) {
    const alt = await lookup(flippedKey);
    if (alt) {
      console.log(
        `\n  💡 קיים צירוף תואם עבור משרת-אם = "${motherBool ? 'לא' : 'כן'}" (מפתח "${flippedKey}").\n` +
          '     בדוק את שדה הילדים מתחת לגיל 14 ואת היקף המשרה הכולל של העובד/ת (יתר התקנים במערכת) —\n' +
          '     ייתכן שמשרת אם התהפכה. זו בדיוק המלכודת ש-/api/schedule/compute מדווח עליה כרמז.',
      );
      printRow(alt);
      process.exit(0);
    }
  }
}

console.log(
  '\n  אין מבנה שבוע עבודה במחשבון לצירוף הזה. בדוק: שכבה, סך השעות (עיגול לחצי),\n' +
    '  קטגוריית האופק (נגזרת מ-scheduleType!), ושעות הגיל.',
);
process.exit(1);
