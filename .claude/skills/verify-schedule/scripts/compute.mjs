/**
 * אימות תרחישי /api/schedule/compute מול הדב-סרבר, במקום curl ידני + עין אנושית.
 * מריץ תרחיש בודד או קובץ תרחישים, מדפיס את השדות המרכזיים בשורה קומפקטית,
 * ואם לתרחיש יש בלוק `expect` — משווה שדה-שדה ויוצא בקוד 1 על אי-התאמה.
 *
 * קונפיג (משתני סביבה, יש ברירות מחדל):
 *   COMPUTE_URL  ברירת מחדל http://localhost:3010/api/schedule/compute
 *   COMPUTE_TOKEN ברירת מחדל shtilim-123456  (טוקן הבדיקה מ-CLAUDE.md, מול Airtable אמיתי)
 *                 למצב mock: הרץ dev עם AIRTABLE_MOCK=1 ותן COMPUTE_TOKEN=dev + COMPUTE_URL על הפורט המתאים.
 *
 * שימוש:
 *   # תרחיש בודד inline
 *   node .claude/skills/verify-schedule/scripts/compute.mjs --body '{"category":"הוראה","scheduleType":"הוראה","layer":"יסודי","ageHours":0,"enteredHours":30,"gender":"נקבה","maritalStatus":"נשוי/ה","hasChildrenUnder14":true,"budgetRemaining":200}'
 *
 *   # קובץ תרחישים (ראה scenarios.example.json בסקיל)
 *   node .claude/skills/verify-schedule/scripts/compute.mjs scenarios.json
 *
 * הטוקן מוזרק ע"י הסקריפט — אין צורך לכלול אותו ב-body של התרחישים.
 */
import { readFileSync } from 'node:fs';

const URL = process.env.COMPUTE_URL || 'http://localhost:3010/api/schedule/compute';
const TOKEN = process.env.COMPUTE_TOKEN || 'shtilim-123456';

const args = process.argv.slice(2);
const bodyIdx = args.indexOf('--body');
let scenarios;
if (bodyIdx >= 0) {
  scenarios = [{ name: 'inline', body: JSON.parse(args[bodyIdx + 1]) }];
} else {
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('נדרש קובץ תרחישים או --body. ראה scenarios.example.json בתיקיית הסקיל.');
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  scenarios = Array.isArray(parsed) ? parsed : [parsed];
}

/** השדות שמעניין לראות בכל תשובה, בסדר קריא. */
const SHOW = [
  'ok', 'reason', 'finalHours', 'jobPercent', 'motherPosition',
  'frontalHours', 'individualHours', 'stayHoursInstitution', 'stayHoursHome',
  'utilizedHours', 'overBudget', 'additionalRoles',
  'previousYear', 'reducedVsLastYear', 'key',
];

const fmt = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

let failures = 0;

for (const sc of scenarios) {
  const name = sc.name || 'scenario';
  let res, json;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, ...sc.body }),
    });
    json = await res.json();
  } catch (e) {
    console.error(`\n✗ ${name}: הבקשה נכשלה (${String(e)}). האם הדב-סרבר רץ על ${URL}?`);
    failures++;
    continue;
  }

  console.log(`\n■ ${name}  [HTTP ${res.status}]`);
  for (const k of SHOW) {
    if (json[k] !== undefined) console.log(`    ${k.padEnd(22)} ${fmt(json[k])}`);
  }
  if (json.message) console.log(`    message                ${json.message}`);

  if (sc.expect) {
    for (const [k, want] of Object.entries(sc.expect)) {
      const got = json[k];
      const ok = fmt(got) === fmt(want);
      console.log(`    ${ok ? '✓' : '✗'} expect ${k}: ${fmt(want)}${ok ? '' : `  (קיבל: ${fmt(got)})`}`);
      if (!ok) failures++;
    }
  }
}

console.log('');
if (failures > 0) {
  console.log(`${failures} אי-התאמות. תרחיש שיציב — קדם אותו לטסט vitest (ראה SKILL.md).`);
  process.exit(1);
}
console.log('כל התרחישים תואמים לצפי.');
