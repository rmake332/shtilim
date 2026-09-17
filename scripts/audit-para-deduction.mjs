/**
 * בדיקת תקינות של ניכוי הפרא בין תקנים. קריאה בלבד, לא כותב דבר.
 *
 * הניכוי של 35/40 נלקח פעם אחת ליום, לכל עובד ומוסד. כשלעובד כמה תקנים באותו
 * יום, אחד מהם מנכה והשאר נשענים עליו. התלות הזו שבירה: השעות נשמרות כצילום
 * מצב, ואם התקן המנכה נמחק (המחיקה נעשית ב-Make, מחוץ לאפליקציה) אף אחד לא
 * מחשב מחדש את מי שנשען עליו, והוא נשאר מנופח בלי שאיש יידע.
 *
 * הסקריפט קורא את חותמת הניכוי של כל תקן פרא ובודק אם ההנחה שרשומה בה עדיין
 * מתקיימת: תקן שכתוב בו שדילג ביום מסוים חייב שיהיה מי שמנכה באותו יום, ותקן
 * שכתוב בו שניכה לא יכול לחלוק את היום עם תקן מנכה נוסף.
 *
 * מתי להריץ: אחרי גל הסרות של תקנים, או תקופתית. הפלט הריק הוא הפלט הרצוי.
 * הרצה: node scripts/audit-para-deduction.mjs
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

const POSITIONS = 'tbl6nWUseVBUIylhV';
const BUDGET = 'tblOL1fYEC9ZMOBE5';
const PARA_MIN_DAY_MINUTES = 80;

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
  weeklyHours: fieldId('POSITION_FIELDS', 'weeklyHours'),
  stamp: fieldId('POSITION_FIELDS', 'paraDeduction'),
  detail: fieldId('POSITION_FIELDS', 'paraDeductionDetail'),
};
const BUDGET_SCHEDULE_TYPE = fieldId('BUDGET_FIELDS', 'scheduleType');

const schedBlock = /export const SCHEDULE_FIELDS = \{([\s\S]*?)\n\} as const;/.exec(schema)[1];
const SCHEDULE = {};
for (const m of schedBlock.matchAll(/(\w+): \{ in: \[([^\]]*)\], out: \[([^\]]*)\] \}/g)) {
  const ids = (s) => [...s.matchAll(/'(fld\w+)'/g)].map((x) => x[1]);
  SCHEDULE[m[1]] = { in: ids(m[2]), out: ids(m[3]) };
}
const PARA_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LETTER = { sun: 'א', mon: 'ב', tue: 'ג', wed: 'ד', thu: 'ה', fri: 'ו' };
const LETTER_DAY = Object.fromEntries(Object.entries(DAY_LETTER).map(([d, l]) => [l, d]));

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

/** אותה לוגיקה כמו parseParaDeductionDetail ב-src/lib/schedule/paraDeductionStamp.ts. */
function parseDetail(detail) {
  if (!detail || !detail.trim()) return null;
  const out = {};
  let found = false;
  for (const m of detail.matchAll(/(?:^|,\s*)([א-ו]):(\d+)/g)) {
    const day = LETTER_DAY[m[1]];
    if (!day) return null;
    out[day] = Number(m[2]);
    found = true;
  }
  return found ? out : null;
}

/** האם התקן ניכה ביום נתון: חותמת קודם, גזירה כגיבוי. זהה לקוד הייצור. */
function deductedOn(p, day) {
  if (p.stamp === 'לא נדרש') return false;
  const parsed = parseDetail(p.detail);
  if (parsed) return (parsed[day] ?? 0) > 0;
  return isPara(p.scheduleType) && p.minutes[day] >= PARA_MIN_DAY_MINUTES;
}

const budgetRows = await listAll(BUDGET, [BUDGET_SCHEDULE_TYPE]);
const scheduleTypeOf = new Map(budgetRows.map((r) => [r.id, text(r.fields[BUDGET_SCHEDULE_TYPE])]));

const posFields = [...Object.values(F)];
for (const d of PARA_DAYS) posFields.push(...SCHEDULE[d].in, ...SCHEDULE[d].out);
const recs = (await listAll(POSITIONS, posFields)).map((r) => {
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
  return {
    id: r.id,
    tz: text(f[F.tz]).trim(),
    mosad: linkIds(f[F.mosad])[0] ?? '',
    name: [roleTitle, text(f[F.mosadName])].filter(Boolean).join(' - '),
    employee: text(f[F.employeeName]),
    prevYear: text(f[F.prevYear]) === 'כן',
    scheduleType: scheduleTypeOf.get(linkIds(f[F.roleLink])[0] ?? '') ?? '',
    stored: Number(f[F.weeklyHours]) || 0,
    stamp: text(f[F.stamp]),
    detail: text(f[F.detail]),
    minutes,
  };
});

const groups = new Map();
for (const p of recs) {
  if (!p.tz || !p.mosad || p.prevYear) continue;
  const k = `${p.tz}|${p.mosad}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(p);
}

/**
 * הבדיקה היא מבנית ולא חשבונית, בכוונה.
 *
 * מתבקש להשוות את השעות השמורות לשעות המחושבות מחדש, אבל זו השוואה שגויה:
 * `weeklyHours` של תקן פרא אינו סך השעות שהוזנו אלא **הפלט של מחשבון אופק**
 * (פרונטלי + פרטני), והשעות שהוזנו שימשו רק כמפתח חיפוש. השניים שווים ברוב
 * התקנים אך לא בכולם, וההשוואה מייצרת התראות שווא.
 *
 * החותמת מייתרת את החשבון: היא אומרת במפורש באילו ימים דולג הניכוי, ואפשר
 * לבדוק ישירות אם ההנחה הזו עדיין מתקיימת מול מצב הבסיס.
 */
const findings = [];
let checked = 0;

for (const p of recs) {
  if (p.prevYear || !isPara(p.scheduleType)) continue;
  const parsed = parseDetail(p.detail);
  if (!parsed) continue; // בלי חותמת קריאה אין מה לאמת
  checked++;

  const peers = (groups.get(`${p.tz}|${p.mosad}`) ?? []).filter((o) => o.id !== p.id);
  const notes = [];

  for (const d of PARA_DAYS) {
    const claimed = parsed[d];
    if (claimed === undefined) continue;
    const holder = peers.find((o) => deductedOn(o, d));

    // התקן המנכה נמחק או שינה ימים: אף אחד כבר לא מנכה, והשעות כאן גבוהות מדי.
    if (claimed === 0 && !holder)
      notes.push(
        `יום ${DAY_LETTER[d]}: החותמת אומרת שדולג הניכוי, אך אף תקן אחר אינו מנכה ביום זה. ` +
          `השעות גבוהות ב-${((p.minutes[d] < 100 ? 35 : 40) / 45).toFixed(2)} מהנדרש.`,
      );
    // שני תקנים מנכים באותו יום: הניכוי נלקח פעמיים, והשעות נמוכות מדי.
    if (claimed > 0 && holder)
      notes.push(
        `יום ${DAY_LETTER[d]}: נוכה כאן וגם ב-${holder.name} - ניכוי כפול באותו יום.`,
      );
  }

  if (notes.length) findings.push({ p, notes });
}

console.log(`תקני הזנת פרא עם חותמת שנבדקו: ${checked}`);
console.log(`תקנים הדורשים טיפול: ${findings.length}`);
console.log('');
for (const { p, notes } of findings) {
  console.log(`${p.employee} | ${p.name} | ${p.id}`);
  console.log(`   שעות שמורות: ${p.stored} | חותמת: ${p.stamp} | ${p.detail}`);
  for (const n of notes) console.log(`   ${n}`);
}
if (findings.length === 0) console.log('הכל תקין.');
