/**
 * Backfill חד-פעמי של חותמת ניכוי הפרא על תקנים קיימים.
 *
 * למה: עד היום לא נשמר בשום מקום אם נוכו בתקן 35/40 מנוסחת הפרא. הקוד גזר זאת
 * מחדש בכל חישוב, וכך תקן ששמור עם שעות תקינות התחיל לקבל מספר אחר בעריכה רק
 * כי המציאות סביבו השתנתה. החותמת מתעדת מה קרה בפועל, וגוברת על הגזירה.
 *
 * מה הוא כותב: רק תקני הזנת פרא ("פרא" / "הוראה - לוח פרא") שאינם תקני שנה
 * קודמת. תקן בכל סוג מערכת אחר מקבל את תשובתו מהגזירה, ושם הגזירה ודאית - היא
 * מעולם לא ניכתה דבר. אין סיבה לגעת בכ-2,900 רשומות כדי לכתוב "לא נדרש".
 *
 * איך משוחזר העבר: לא בהנחה אלא בסדר היצירה. בכל צירוף של ת.ז. + מוסד + יום,
 * התקן שנוצר ראשון הוא זה שניכה, וכל מי שבא אחריו דילג ונשען עליו. זה בדיוק
 * מה שהקוד עשה בזמן אמת.
 *
 * הרצה: node scripts/backfill-para-deduction.mjs
 * DRY_RUN=true כברירת מחדל - מדפיס בלבד. לשנות ל-false כדי לכתוב בפועל.
 */
import { readFileSync } from 'node:fs';

// ===== הגדרות =====
// ברירת מחדל: מדווח בלבד. לכתיבה בפועל: DRY_RUN=false node scripts/backfill-para-deduction.mjs
const DRY_RUN = process.env.DRY_RUN !== 'false';
const MAX_REPORT_ROWS = 40;
// ==================

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

const POSITIONS = 'tbl6nWUseVBUIylhV';
const BUDGET = 'tblOL1fYEC9ZMOBE5';
const PARA_MIN_DAY_MINUTES = 80;

// ---- מזהי שדות נקראים מ-schema.ts, כדי ששום מזהה לא יועתק ביד
const schema = readFileSync('src/lib/airtable/schema.ts', 'utf8');
function fieldId(block, key) {
  const b = new RegExp(`export const ${block} = \\{([\\s\\S]*?)\\n\\} as const;`).exec(schema)[1];
  const m = new RegExp(`\\n\\s*${key}: '(fld\\w+)'`).exec(b);
  if (!m) throw new Error(`${block}.${key} not found in schema.ts`);
  return m[1];
}
const F = {
  tz: fieldId('POSITION_FIELDS', 'tzLookup'),
  mosad: fieldId('POSITION_FIELDS', 'mosadLookup'),
  roleLink: fieldId('POSITION_FIELDS', 'roleLink'),
  prevYear: fieldId('POSITION_FIELDS', 'prevYearStatus'),
  roleTitle: fieldId('POSITION_FIELDS', 'roleTitleText'),
  mosadName: fieldId('POSITION_FIELDS', 'mosadNameText'),
  employeeName: fieldId('POSITION_FIELDS', 'employeeNameText'),
  stamp: fieldId('POSITION_FIELDS', 'paraDeduction'),
  detail: fieldId('POSITION_FIELDS', 'paraDeductionDetail'),
  leansOn: fieldId('POSITION_FIELDS', 'paraDeductionLeansOn'),
};
const BUDGET_SCHEDULE_TYPE = fieldId('BUDGET_FIELDS', 'scheduleType');

const schedBlock = /export const SCHEDULE_FIELDS = \{([\s\S]*?)\n\} as const;/.exec(schema)[1];
const SCHEDULE = {};
for (const m of schedBlock.matchAll(/(\w+): \{ in: \[([^\]]*)\], out: \[([^\]]*)\] \}/g)) {
  const ids = (s) => [...s.matchAll(/'(fld\w+)'/g)].map((x) => x[1]);
  SCHEDULE[m[1]] = { in: ids(m[2]), out: ids(m[3]) };
}
// הזנת פרא רצה על ראשון עד שישי; מוצ"ש שייך למערכת שעות רגילה בלבד.
const PARA_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LETTER = { sun: 'א', mon: 'ב', tue: 'ג', wed: 'ד', thu: 'ה', fri: 'ו' };

// ---- Airtable
async function listAll(table, fields) {
  const out = [];
  let offset;
  do {
    const p = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
    for (const f of fields) p.append('fields[]', f);
    if (offset) p.set('offset', offset);
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}?${p}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`${table} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}

async function patchBatch(records) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${POSITIONS}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    // בלי typecast בכוונה: אופציות ה-singleSelect כבר קיימות, ו-typecast היה
    // עלול ליצור מחדש אופציה שנמחקה (ראו gotcha-typecast-recreates-select-options).
    body: JSON.stringify({ records, returnFieldsByFieldId: true }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const text = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(',');
  if (typeof v === 'object' && 'name' in v) return String(v.name);
  return String(v);
};
const linkIds = (v) =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean) : [];
const secs = (v) => (typeof v === 'number' ? v : Array.isArray(v) ? secs(v[0]) : null);
const isPara = (t) => t === 'פרא' || t === 'הוראה - לוח פרא';

// ---- fetch
console.log('שולף תקציב התחלתי...');
const budgetRows = await listAll(BUDGET, [BUDGET_SCHEDULE_TYPE]);
const scheduleTypeOf = new Map(budgetRows.map((r) => [r.id, text(r.fields[BUDGET_SCHEDULE_TYPE])]));

console.log('שולף תקנים פעילים...');
const posFields = [...Object.values(F)];
for (const d of PARA_DAYS) posFields.push(...SCHEDULE[d].in, ...SCHEDULE[d].out);
const positions = await listAll(POSITIONS, posFields);

const recs = positions.map((r) => {
  const f = r.fields;
  const minutes = {};
  for (const d of PARA_DAYS) {
    let m = 0;
    for (let i = 0; i < SCHEDULE[d].in.length; i++) {
      const a = secs(f[SCHEDULE[d].in[i]]);
      const b = secs(f[SCHEDULE[d].out[i]]);
      if (a == null || b == null || b <= a) continue;
      m += (b - a) / 60;
    }
    minutes[d] = Math.round(m);
  }
  const roleTitle = text(f[F.roleTitle]);
  const mosadName = text(f[F.mosadName]);
  return {
    id: r.id,
    createdTime: r.createdTime,
    tz: text(f[F.tz]).trim(),
    mosad: linkIds(f[F.mosad])[0] ?? '',
    name: [roleTitle, mosadName].filter(Boolean).join(' - ') || 'תקן קיים',
    employee: text(f[F.employeeName]),
    prevYear: text(f[F.prevYear]) === 'כן',
    scheduleType: scheduleTypeOf.get(linkIds(f[F.roleLink])[0] ?? '') ?? '',
    current: {
      stamp: text(f[F.stamp]),
      detail: text(f[F.detail]),
      leansOn: linkIds(f[F.leansOn]).sort(),
    },
    minutes,
  };
});

// ---- replay: בכל ת.ז.+מוסד+יום, מי שנוצר ראשון הוא שניכה
const eligible = recs
  .filter((p) => !p.prevYear && isPara(p.scheduleType) && p.tz && p.mosad)
  .sort((a, b) => a.createdTime.localeCompare(b.createdTime));

/** "tz|mosad|day" → התקן שמחזיק את הניכוי באותו יום. */
const holder = new Map();
const planned = [];

for (const p of eligible) {
  const entries = [];
  const leansOn = new Set();

  for (const d of PARA_DAYS) {
    const min = p.minutes[d];
    // יום מתחת לסף שנוסחת הפרא בכלל לא רצה עליו אינו נכנס לחותמת.
    if (min < PARA_MIN_DAY_MINUTES) continue;
    const key = `${p.tz}|${p.mosad}|${d}`;
    const held = holder.get(key);
    if (held) {
      entries.push({ day: d, minutes: 0, blockedBy: held.name });
      leansOn.add(held.id);
    } else {
      entries.push({ day: d, minutes: min < 100 ? 35 : 40 });
      holder.set(key, p);
    }
  }
  if (entries.length === 0) continue;

  const detail = entries
    .map((e) => {
      const who =
        e.minutes === 0 && e.blockedBy
          ? ` (${e.blockedBy.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim()})`
          : '';
      return `${DAY_LETTER[e.day]}:${e.minutes}${who}`;
    })
    .join(', ');
  const deducted = entries.filter((e) => e.minutes > 0).length;
  const stamp =
    deducted === entries.length ? 'נוכה' : deducted === 0 ? 'תקן נוסף ללא ניכוי' : 'ניכוי חלקי';

  const next = { stamp, detail, leansOn: [...leansOn].sort() };
  const unchanged =
    p.current.stamp === next.stamp &&
    p.current.detail === next.detail &&
    p.current.leansOn.join(',') === next.leansOn.join(',');
  if (!unchanged) planned.push({ p, next });
}

// ---- report
console.log('');
console.log(`תקנים בטבלה: ${recs.length}`);
console.log(`תקני הזנת פרא (לא שנה קודמת): ${eligible.length}`);
console.log(`תקנים שיסומנו: ${planned.length}`);
const byStamp = {};
for (const { next } of planned) byStamp[next.stamp] = (byStamp[next.stamp] ?? 0) + 1;
for (const [k, v] of Object.entries(byStamp)) console.log(`   ${k}: ${v}`);
console.log('');

const interesting = planned.filter((x) => x.next.stamp !== 'נוכה');
console.log(`מתוכם שאינם "נוכה" (${interesting.length}), כל אחד מהם:`);
for (const { p, next } of interesting)
  console.log(`   ${p.employee} | ${p.name} | ${next.stamp} | ${next.detail}`);
console.log('');
console.log(`דוגמאות מתוך אלה שיסומנו "נוכה" (${Math.min(MAX_REPORT_ROWS, planned.length)} ראשונים):`);
for (const { p, next } of planned.filter((x) => x.next.stamp === 'נוכה').slice(0, MAX_REPORT_ROWS))
  console.log(`   ${p.employee} | ${p.name} | ${next.detail}`);

if (DRY_RUN) {
  console.log('');
  console.log('DRY_RUN=true - לא נכתב דבר. לשנות ל-false כדי לבצע.');
  process.exit(0);
}

// ---- write
console.log('');
console.log('כותב...');
let done = 0;
for (let i = 0; i < planned.length; i += 10) {
  const batch = planned.slice(i, i + 10).map(({ p, next }) => ({
    id: p.id,
    fields: {
      [F.stamp]: next.stamp,
      [F.detail]: next.detail,
      [F.leansOn]: next.leansOn,
    },
  }));
  await patchBatch(batch);
  done += batch.length;
  console.log(`   ${done}/${planned.length}`);
}
console.log('הושלם.');
