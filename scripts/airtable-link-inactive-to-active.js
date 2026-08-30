/**
 * סקריפט לאיירטייבל (Scripting extension) - קישור "עובדים לא פעילים" ל"תקנים פעילים"
 *
 * מה הוא עושה:
 * לכל רשומה בטבלת "עובדים לא פעילים" מחפש בטבלת "תקנים פעילים" רשומה עם שלושת
 * הערכים הזהים - ת.ז. + שם מוסד טקסט + תפקיד טקסט - ואם נמצאה, מקשר אותה לשדה
 * "תקן בתקנים פעילים".
 *
 * איך מריצים:
 * באיירטייבל → Extensions → Scripting → להדביק את כל התוכן → Run.
 * זה לא חלק מקוד האפליקציה.
 *
 * חשוב: DRY_RUN מוגדר true כברירת מחדל - הריצה הראשונה רק מדפיסה מה היה מתקשר,
 * בלי לשנות כלום. לבדוק את הפלט, ורק אז לשנות ל-false ולהריץ שוב לכתיבה בפועל.
 *
 * בסיס: appKlvldLrk14ird8 (שתילים ירושלים)
 */

// ===== הגדרות =====
const DRY_RUN = true; // true = רק מדווח, לא כותב. false = מבצע קישור בפועל
const ONLY_EMPTY = true; // true = מדלג על רשומות שכבר מקושרות. false = דורס קישור קיים
const MULTI_MATCH = 'all'; // כשנמצאה יותר מהתאמה אחת: 'all' | 'first' | 'skip'
const MAX_REPORT_ROWS = 100; // כמה שורות להציג בכל טבלת דיווח בפלט
// ==================

// מזהי טבלאות ושדות (מזהים ולא שמות - כדי שהסקריפט לא יישבר אם משנים שם שדה)
const INACTIVE_TABLE = 'tbluJdJUISLPNlspS'; // עובדים לא פעילים
const ACTIVE_TABLE = 'tbl6nWUseVBUIylhV'; // תקנים פעילים

const INACTIVE = {
    name: 'fldhQkfsCnxDpfpSA', // שם עובד (שדה ראשי)
    tz: 'fldIbWNMzbI7p7Tn0', // ת.ז.
    mosad: 'fldnRTGyrq8njna0b', // שם מוסד טקסט
    role: 'fldHmDB3VPfiaDEtI', // תפקיד טקסט
    link: 'fld5BP9zpbJ8jH74B', // תקן בתקנים פעילים
};

const ACTIVE = {
    name: 'fldTu3q08qnIksiKD', // שם עובד (שדה ראשי)
    tz: 'fldkPFYk5eyckkMf3', // ת.ז.
    mosad: 'fldFdcjyhrWoo6Pg9', // שם מוסד טקסט
    role: 'fldj0mMBrS5n5QxlL', // תפקיד טקסט
};

/** הופך כל ערך תא (טקסט / lookup / select / מערך) למחרוזת מנורמלת להשוואה. */
function norm(value) {
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
    return String(v)
        .replace(/[​‎‏‪-‮]/g, '') // תווי כיווניות/רווח נסתרים
        .replace(/\s+/g, ' ')
        .trim();
}

/** נרמול ת.ז.: ספרות/אותיות בלבד, והשלמת אפסים מובילים ל-9 ספרות. */
function normTz(value) {
    const raw = norm(value).replace(/[^0-9A-Za-z]/g, '');
    if (!raw) return '';
    return /^\d+$/.test(raw) ? raw.padStart(9, '0') : raw.toUpperCase();
}

/** מפתח ההשוואה: ת.ז. + שם מוסד + תפקיד. */
function buildKey(tz, mosad, role) {
    return normTz(tz) + '||' + norm(mosad) + '||' + norm(role);
}

const inactiveTable = base.getTable(INACTIVE_TABLE);
const activeTable = base.getTable(ACTIVE_TABLE);

const activeQuery = await activeTable.selectRecordsAsync({
    fields: [ACTIVE.name, ACTIVE.tz, ACTIVE.mosad, ACTIVE.role],
});
const inactiveQuery = await inactiveTable.selectRecordsAsync({
    fields: [INACTIVE.name, INACTIVE.tz, INACTIVE.mosad, INACTIVE.role, INACTIVE.link],
});

// אינדקס התקנים הפעילים לפי המפתח המשולש
const activeByKey = new Map();
let activeSkippedIncomplete = 0;
for (const rec of activeQuery.records) {
    const tz = rec.getCellValue(ACTIVE.tz);
    const mosad = rec.getCellValue(ACTIVE.mosad);
    const role = rec.getCellValue(ACTIVE.role);
    if (!normTz(tz) || !norm(mosad) || !norm(role)) {
        activeSkippedIncomplete++;
        continue;
    }
    const key = buildKey(tz, mosad, role);
    if (!activeByKey.has(key)) activeByKey.set(key, []);
    activeByKey.get(key).push(rec);
}

const updates = [];
const matchedRows = [];
const multiRows = [];
const noMatchRows = [];
let alreadyLinked = 0;
let missingData = 0;

for (const rec of inactiveQuery.records) {
    const existingLinks = rec.getCellValue(INACTIVE.link) || [];
    if (ONLY_EMPTY && existingLinks.length > 0) {
        alreadyLinked++;
        continue;
    }

    const tz = rec.getCellValue(INACTIVE.tz);
    const mosad = rec.getCellValue(INACTIVE.mosad);
    const role = rec.getCellValue(INACTIVE.role);

    if (!normTz(tz) || !norm(mosad) || !norm(role)) {
        missingData++;
        noMatchRows.push({
            עובד: rec.getCellValueAsString(INACTIVE.name),
            'ת.ז.': normTz(tz),
            מוסד: norm(mosad),
            תפקיד: norm(role),
            סיבה: 'חסר אחד משדות ההשוואה',
        });
        continue;
    }

    const matches = activeByKey.get(buildKey(tz, mosad, role)) || [];

    if (matches.length === 0) {
        noMatchRows.push({
            עובד: rec.getCellValueAsString(INACTIVE.name),
            'ת.ז.': normTz(tz),
            מוסד: norm(mosad),
            תפקיד: norm(role),
            סיבה: 'לא נמצאה התאמה',
        });
        continue;
    }

    if (matches.length > 1) {
        multiRows.push({
            עובד: rec.getCellValueAsString(INACTIVE.name),
            'ת.ז.': normTz(tz),
            מוסד: norm(mosad),
            תפקיד: norm(role),
            'מספר התאמות': matches.length,
            טיפול:
                MULTI_MATCH === 'skip'
                    ? 'דולג'
                    : MULTI_MATCH === 'first'
                      ? 'קושרה הראשונה'
                      : 'קושרו כולן',
        });
        if (MULTI_MATCH === 'skip') continue;
    }

    const toLink = MULTI_MATCH === 'first' ? matches.slice(0, 1) : matches;

    updates.push({
        id: rec.id,
        fields: { [INACTIVE.link]: toLink.map((m) => ({ id: m.id })) },
    });

    matchedRows.push({
        עובד: rec.getCellValueAsString(INACTIVE.name),
        'ת.ז.': normTz(tz),
        מוסד: norm(mosad),
        תפקיד: norm(role),
        'תקן שקושר': toLink.map((m) => m.getCellValueAsString(ACTIVE.name)).join(' | '),
    });
}

// ===== כתיבה =====
let written = 0;
if (!DRY_RUN && updates.length > 0) {
    for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        await inactiveTable.updateRecordsAsync(batch);
        written += batch.length;
    }
}

// ===== דיווח =====
output.markdown(`## ${DRY_RUN ? 'הרצת יבש (DRY_RUN) - לא בוצע שום שינוי' : 'בוצע קישור'}`);
output.markdown(
    [
        `- רשומות ב"עובדים לא פעילים": **${inactiveQuery.records.length}**`,
        `- תקנים פעילים באינדקס: **${activeQuery.records.length - activeSkippedIncomplete}**` +
            (activeSkippedIncomplete ? ` (דולגו ${activeSkippedIncomplete} תקנים עם שדה השוואה חסר)` : ''),
        `- כבר מקושרות ודולגו: **${alreadyLinked}**`,
        `- נמצאה התאמה: **${matchedRows.length}**`,
        `- רשומות עם יותר מהתאמה אחת: **${multiRows.length}**` +
            (MULTI_MATCH === 'skip' ? ' (דולגו לפי ההגדרה)' : ''),
        `- ללא התאמה: **${noMatchRows.length - missingData}**`,
        `- חסר מידע להשוואה: **${missingData}**`,
        DRY_RUN
            ? '- **לא נכתב כלום.** לביצוע בפועל: לשנות `DRY_RUN` ל-`false` ולהריץ שוב.'
            : `- עודכנו בפועל: **${written}**`,
    ].join('\n')
);

if (matchedRows.length) {
    output.markdown(`### התאמות (${Math.min(matchedRows.length, MAX_REPORT_ROWS)} מתוך ${matchedRows.length})`);
    output.table(matchedRows.slice(0, MAX_REPORT_ROWS));
}
if (multiRows.length) {
    output.markdown(
        `### יותר מהתאמה אחת - כדאי לבדוק ידנית (${Math.min(multiRows.length, MAX_REPORT_ROWS)} מתוך ${multiRows.length})`
    );
    output.table(multiRows.slice(0, MAX_REPORT_ROWS));
}
if (noMatchRows.length) {
    output.markdown(`### ללא התאמה (${Math.min(noMatchRows.length, MAX_REPORT_ROWS)} מתוך ${noMatchRows.length})`);
    output.table(noMatchRows.slice(0, MAX_REPORT_ROWS));
}
