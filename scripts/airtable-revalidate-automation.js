/**
 * סקריפט לאוטומציה באיירטייבל: Run script
 * מנקה את קאש הטופס אחרי שינוי רשומה, כדי שהעדכון יופיע בטופס תוך שניות.
 *
 * זה לא חלק מקוד האפליקציה - להעתיק את התוכן לתוך פעולת "Run a script"
 * באוטומציה באיירטייבל. ראו docs/airtable-cache-revalidation.md
 *
 * שלוש אוטומציות, אחת לכל טבלה. ההבדל היחיד ביניהן הוא הערך של TABLE למטה:
 *   תקציב התחלתי → 'tblOL1fYEC9ZMOBE5'
 *   סמלי מוסד    → 'tbl4BCMW4gwsIPxG7'
 *   תקנים תשפו   → 'tblRy4vCSm7ePybx8'
 */

// ===== להתאים =====
const BASE_URL = 'https://<הדומיין-של-הטופס>'; // בלי / בסוף
const SECRET = '<REVALIDATE_SECRET>';
const TABLE = 'tblOL1fYEC9ZMOBE5'; // הטבלה שהאוטומציה הזו יושבת עליה
// ==================

const res = await fetch(`${BASE_URL}/api/revalidate`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-revalidate-secret': SECRET,
    },
    body: JSON.stringify({ table: TABLE }),
});

const text = await res.text();
console.log(`revalidate ${res.status}: ${text}`);

// זריקת שגיאה מסמנת את הריצה כנכשלה ברשימת ההיסטוריה של האוטומציה,
// כך שאפשר לראות בלי לחפש אם הרענון הפסיק לעבוד.
if (!res.ok) {
    throw new Error(`revalidate failed: ${res.status} ${text}`);
}
