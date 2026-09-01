/**
 * שליחת טופס מלא ל-/api/submit מ-payload בקובץ, במקום להרכיב JSON ענק ידנית ב-curl.
 *
 * ⚠️ /api/submit כותב רשומה אמיתית לטבלת "תקנים פעילים" (ועובד חדש). לכן ברירת
 * המחדל היא מצב MOCK (פורט 3011, טוקן dev) שלא נוגע ב-Airtable האמיתי. שליחה מול
 * טוקן/סביבה אמיתית חסומה אלא אם מועבר במפורש --allow-real (ואז באחריותך בלבד).
 *
 * קונפיג (משתני סביבה, יש ברירות מחדל):
 *   SUBMIT_URL    ברירת מחדל http://localhost:3011/api/submit  (שרת ה-mock)
 *   SUBMIT_TOKEN  ברירת מחדל dev
 *
 * הפעלת שרת mock (טרמינל נפרד):
 *   AIRTABLE_MOCK=1 npx next dev -p 3011
 *
 * שימוש:
 *   node .claude/skills/submit-e2e/scripts/submit.mjs payload.json
 *   node .claude/skills/submit-e2e/scripts/submit.mjs payload.example.json   # (בתיקיית הסקיל)
 *
 * הטוקן מוזרק ע"י הסקריפט — אין לכלול token ב-payload.
 */
import { readFileSync } from 'node:fs';

const URL = process.env.SUBMIT_URL || 'http://localhost:3011/api/submit';
const TOKEN = process.env.SUBMIT_TOKEN || 'dev';

const args = process.argv.slice(2);
const allowReal = args.includes('--allow-real');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('נדרש קובץ payload. ראה payload.example.json בתיקיית הסקיל.');
  process.exit(1);
}

// שער בטיחות: כל דבר שאינו mock ברור (טוקן dev + localhost) חסום ללא --allow-real.
const looksMock = TOKEN === 'dev' && /localhost|127\.0\.0\.1/.test(URL);
if (!looksMock && !allowReal) {
  console.error(
    '⛔ נחסם: היעד אינו נראה כמו שרת mock (טוקן dev + localhost).\n' +
      `   URL=${URL} TOKEN=${TOKEN}\n` +
      '   /api/submit כותב רשומה אמיתית ל-Airtable. אם זו הכוונה, הוסף --allow-real.',
  );
  process.exit(1);
}

const payload = JSON.parse(readFileSync(file, 'utf8'));

let res, json;
try {
  res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, ...payload }),
  });
  json = await res.json();
} catch (e) {
  console.error(`הבקשה נכשלה (${String(e)}). האם השרת רץ על ${URL}?`);
  process.exit(1);
}

console.log(`[HTTP ${res.status}] ${looksMock ? '(mock)' : '(REAL ⚠️)'}`);
console.log(JSON.stringify(json, null, 2));
process.exit(res.ok && json.ok !== false ? 0 : 1);
