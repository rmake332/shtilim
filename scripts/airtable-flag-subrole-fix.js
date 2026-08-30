/**
 * סקריפט לאיירטייבל (Scripting extension) - סימון תקנים עם תת-תפקיד שגוי
 *
 * מה הוא עושה:
 * לכל רשומה בטבלת "תקנים פעילים" שהערך בשדה "תת-תפקיד" אינו אחד מ-8 הערכים
 * הקנוניים, הוא כותב שני שדות:
 *   1. "תת-תפקיד מקורי"       <- הערך הגולמי כמו שהוא (רק אם השדה ריק)
 *   2. "סטטוס תיקון תת-תפקיד" <- "דורש תיקון"
 * הוא **לא נוגע בשדה תת-תפקיד עצמו**.
 *
 * למה:
 * השדה "תת-תפקיד" בטבלת תשפ"ו הוא טקסט חופשי, והאפליקציה העתיקה ממנו ערכים
 * כמו שהם. `typecast: true` באיירטייבל יוצר מכל מחרוזת לא מוכרת אופציה חדשה,
 * ולכן השדה תפח מ-8 ל-48 אופציות. מכיוון שכל ההשוואות בקוד הן התאמת מחרוזת
 * מדויקת, וריאנטים כמו "מטפלת רגשית" (במקום "מטפל/ת רגשית") עקפו בשקט את שער
 * אישור אפרת ולנדברג ואת דרישת מסמכי ההסמכה ומספר הרישיון.
 *
 * אי אפשר פשוט לתקן את הערך, כי אז נמחק המידע מי מהתקנים לא הוזן נכון וחסרים
 * לו מסמכים. לכן הסקריפט מקפיא את הראיה בשני שדות נפרדים, ורק אחר כך המזכירה
 * עוברת תקן-תקן במסך התיקון באפליקציה (/form/[token]/fix-subrole/[positionId]).
 *
 * איך מריצים:
 * באיירטייבל -> Extensions -> Scripting -> להדביק את כל התוכן -> Run.
 * זה לא חלק מקוד האפליקציה.
 *
 * חשוב: DRY_RUN מוגדר true כברירת מחדל - הריצה הראשונה רק מדפיסה מה היה נכתב,
 * בלי לשנות כלום. לבדוק את הפלט, ורק אז לשנות ל-false ולהריץ שוב לכתיבה בפועל.
 *
 * **סדר הרצה קריטי: הסקריפט חייב לרוץ לפני שמזכירה כלשהי מתחילה לתקן תת-תפקיד.**
 * תקן שתוקן לפני הסימון מאבד את הראיה, וזו בדיוק הבעיה שהסקריפט בא למנוע.
 *
 * בסיס: appKlvldLrk14ird8 (שתילים ירושלים)
 */

// ===== הגדרות =====
const DRY_RUN = true; // true = רק מדווח, לא כותב. false = מבצע סימון בפועל
const ONLY_EMPTY_ORIGINAL = true; // true = לא דורס "תת-תפקיד מקורי" שכבר מלא. אין לשנות ל-false בלי סיבה טובה
const RESET_HANDLED = false; // true = מסמן מחדש "דורש תיקון" גם לתקן שכבר סומן "טופל"
const MAX_REPORT_ROWS = 200; // כמה שורות להציג בטבלאות הפלט
// ==================

const ACTIVE_TABLE = 'tbl6nWUseVBUIylhV'; // תקנים פעילים

const F = {
    subRole: 'fldo5YfqMeJSd9e4W', // תת-תפקיד (singleSelect)
    original: 'fldQHyD3Vdg49JSDd', // תת-תפקיד מקורי (singleLineText)
    fixStatus: 'fldPcX2EzrntmAXGV', // סטטוס תיקון תת-תפקיד (singleSelect)
    employee: 'fldTu3q08qnIksiKD', // שם עובד
    mosad: 'fldFdcjyhrWoo6Pg9', // שם מוסד טקסט
    role: 'fldj0mMBrS5n5QxlL', // תפקיד טקסט
};

const STATUS_NEEDS_FIX = 'דורש תיקון';
const STATUS_HANDLED = 'טופל';

/**
 * 8 הערכים הקנוניים. חייב להישאר זהה ל-CANONICAL_SUB_ROLES ב-src/lib/subRole.ts.
 * הרשימה מוכפלת כאן כי סקריפט של Airtable לא יכול לייבא מקוד האפליקציה.
 */
const CANONICAL = new Set([
    'קלינאות תקשורת',
    'ריפוי בעיסוק',
    'מטפל/ת באומנות',
    'מטפל/ת רגשית',
    'פיזיו',
    'עובדת סוציאלית',
    'הדרכה קלינאות',
    'הדרכה ריפוי בעיסוק',
]);

/** הופך ערך תא (טקסט / lookup / select / מערך) למחרוזת להשוואה. */
function cellText(value) {
    if (value === null || value === undefined) return '';
    let v = value;
    if (Array.isArray(v)) {
        v = v
            .map((item) => (item && typeof item === 'object' ? (item.name ?? item.value ?? '') : item))
            .filter((item) => item !== null && item !== undefined && item !== '')
            .join(' | ');
    } else if (typeof v === 'object') {
        v = v.name ?? v.value ?? '';
    }
    return String(v);
}

const table = base.getTable(ACTIVE_TABLE);
const query = await table.selectRecordsAsync({
    fields: [F.subRole, F.original, F.fixStatus, F.employee, F.mosad, F.role],
});

const updates = [];
const flagged = [];
const byMosad = new Map();
const byValue = new Map();
let canonicalOk = 0;
let emptySubRole = 0;
let alreadyHandled = 0;
let originalKept = 0;

for (const rec of query.records) {
    // הערך נבדק **בלי trim**: "עובדת סוציאלית " עם רווח נגרר הוא אופציה נפרדת
    // בשדה, ולכן התקן עדיין מצביע על ערך שגוי וצריך טיפול.
    const subRole = cellText(rec.getCellValue(F.subRole));
    if (!subRole) { emptySubRole++; continue; }
    if (CANONICAL.has(subRole)) { canonicalOk++; continue; }

    const status = cellText(rec.getCellValue(F.fixStatus));
    if (status === STATUS_HANDLED && !RESET_HANDLED) { alreadyHandled++; continue; }

    const existingOriginal = cellText(rec.getCellValue(F.original));
    const keepOriginal = ONLY_EMPTY_ORIGINAL && existingOriginal !== '';
    if (keepOriginal) originalKept++;

    const fields = { [F.fixStatus]: { name: STATUS_NEEDS_FIX } };
    if (!keepOriginal) fields[F.original] = subRole;
    updates.push({ id: rec.id, fields });

    const mosad = cellText(rec.getCellValue(F.mosad));
    byMosad.set(mosad, (byMosad.get(mosad) || 0) + 1);
    byValue.set(subRole, (byValue.get(subRole) || 0) + 1);

    flagged.push({
        'שם עובד': cellText(rec.getCellValue(F.employee)),
        'מוסד': mosad,
        'תפקיד': cellText(rec.getCellValue(F.role)),
        'תת-תפקיד שגוי': JSON.stringify(subRole), // JSON כדי שרווח נגרר יהיה גלוי
        'מקורי קיים': keepOriginal ? existingOriginal : '(נכתב עכשיו)',
    });
}

// ===== כתיבה =====
let written = 0;
if (!DRY_RUN && updates.length) {
    for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        await table.updateRecordsAsync(batch);
        written += batch.length;
    }
}

// ===== דיווח =====
output.markdown(`## ${DRY_RUN ? 'הרצת יבש (DRY_RUN) - לא בוצע שום שינוי' : 'בוצע סימון'}`);
output.markdown(
    [
        `- סה"כ תקנים בטבלה: **${query.records.length}**`,
        `- ללא תת-תפקיד (לא רלוונטי): **${emptySubRole}**`,
        `- תת-תפקיד קנוני ותקין: **${canonicalOk}**`,
        `- כבר סומנו "${STATUS_HANDLED}" ודולגו: **${alreadyHandled}**`,
        `- **לסימון "${STATUS_NEEDS_FIX}": ${updates.length}**`,
        originalKept ? `- מתוכם עם "תת-תפקיד מקורי" שכבר מלא ולא נדרס: **${originalKept}**` : null,
        `- מוסדות מעורבים: **${byMosad.size}**`,
        DRY_RUN
            ? '- **לא נכתב כלום.** לביצוע בפועל: לשנות `DRY_RUN` ל-`false` ולהריץ שוב.'
            : `- עודכנו בפועל: **${written}**`,
    ].filter(Boolean).join('\n')
);

if (byMosad.size) {
    output.markdown('### פילוח לפי מוסד');
    output.table(
        [...byMosad.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([mosad, count]) => ({ 'מוסד': mosad, 'תקנים לתיקון': count }))
    );
}

if (byValue.size) {
    output.markdown('### פילוח לפי הערך השגוי');
    output.table(
        [...byValue.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ 'תת-תפקיד שגוי': JSON.stringify(value), 'תקנים': count }))
    );
}

if (flagged.length) {
    output.markdown(`### התקנים שסומנו (${Math.min(flagged.length, MAX_REPORT_ROWS)} מתוך ${flagged.length})`);
    output.table(flagged.slice(0, MAX_REPORT_ROWS));
}
