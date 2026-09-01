/**
 * המתנה עד שהדב-סרבר עונה, חוצה-פלטפורמות (Node, לא תלוי בשל).
 * מחזיר קוד יציאה 0 ברגע שמתקבל HTTP כלשהו מהפורט, או 1 בטיימאאוט.
 *
 * שימוש:
 *   node .claude/skills/dev-server/scripts/wait-up.mjs           # פורט 3010, עד 40 שניות
 *   node .claude/skills/dev-server/scripts/wait-up.mjs 3011 60   # פורט וטיימאאוט מותאמים
 */
const port = Number(process.argv[2] || 3010);
const timeoutSec = Number(process.argv[3] || 40);
const url = `http://localhost:${port}/`;
const deadline = Date.now() + timeoutSec * 1000;

while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    console.log(`דב-סרבר עונה על ${url} — HTTP ${res.status}`);
    process.exit(0);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
  }
}
console.error(`הדב-סרבר לא ענה על ${url} תוך ${timeoutSec} שניות.`);
process.exit(1);
