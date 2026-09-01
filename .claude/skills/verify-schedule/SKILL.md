---
name: verify-schedule
description: >-
  אימות תוצאות מחשבון מערכת השעות של שתילים דרך /api/schedule/compute — הרצת
  תרחישים (הוראה / פרא / הוראה ללא שהייה, משרת אם, אחוז משרה, פיצול שהייה,
  חריגת תקציב, השוואה לשנה קודמת) והשוואה מול ערכים צפויים. השתמש בסקיל הזה בכל
  פעם שצריך לבדוק שחישוב שעות/אופק מחזיר תוצאה נכונה, לשחזר באג בחישוב, או לאמת
  שינוי בלוגיקת השעות לפני commit — במקום להרכיב פקודות curl ידניות ולקרוא JSON
  בעין. גם כשהמשתמש רק מתאר תרחיש ("עובדת עם 30 שעות בהוראה, מה יוצא") זה המקום.
---

# אימות מחשבון מערכת השעות (שתילים)

הכלל מ-CLAUDE.md: `scheduleType` (לא `category`) קובע איך נספרות השעות ואם רץ
מחשבון אופק. הלוגיקה הטהורה יושבת ב-`src/lib/schedule/` (מכוסה בטסטים);
ה-endpoint `/api/schedule/compute` מרכיב הכל יחד עם נתוני Airtable.

## מתי מריצים דרך ה-endpoint ומתי כותבים טסט

- **פונקציה טהורה** (פיצול שהייה, ניצול שעות, מפתח אופק, אחוז משרה, משרת אם):
  הבדיקה הנכונה היא **טסט vitest** ב-`src/lib/schedule/*.test.ts`, לא HTTP.
  זה מהיר, דטרמיניסטי, ורץ ב-CI. ראה `ofek.test.ts` כדוגמה (למשל `splitStayHours`,
  `computeUtilizedHours`).
- **הרכבה מלאה מול Airtable** (שילוב תקנים קיימים, שליפת שורת אופק אמיתית,
  יתרת תקציב, השוואה לשנה קודמת): כאן ה-endpoint הוא הדרך — צריך את הדאטה החי.

**כלל אצבע:** אם שחזרת באג דרך תרחיש HTTP והוא ניתן לצמצום לפונקציה טהורה —
קדם אותו לטסט vitest אחרי התיקון, כך שלא יחזור. תרחיש ה-HTTP הוא כלי חקירה,
לא רשת הביטחון הקבועה.

## הרצת תרחישים

דורש שהדב-סרבר רץ (ראה סקיל `dev-server`). ברירת מחדל: `http://localhost:3010`
עם טוקן הבדיקה `shtilim-123456` מול Airtable אמיתי.

```bash
# תרחיש בודד inline
node .claude/skills/verify-schedule/scripts/compute.mjs --body '{"category":"הוראה","scheduleType":"הוראה","layer":"יסודי","ageHours":0,"enteredHours":30,"gender":"נקבה","maritalStatus":"נשוי/ה","hasChildrenUnder14":true,"budgetRemaining":200}'

# קובץ תרחישים עם ערכי expect (מעתיקים ומתאימים את scenarios.example.json)
node .claude/skills/verify-schedule/scripts/compute.mjs scenarios.json
```

הסקריפט מזריק את הטוקן בעצמו — אין לכלול `token` ב-body של התרחישים.
כל תרחיש עם בלוק `expect` מושווה שדה-שדה; אי-התאמה מסמנת ✗ ומחזירה קוד יציאה 1.

### מצב mock (בלי Airtable אמיתי)

```bash
AIRTABLE_MOCK=1 npx next dev -p 3011   # בטרמינל נפרד
COMPUTE_URL=http://localhost:3011/api/schedule/compute COMPUTE_TOKEN=dev \
  node .claude/skills/verify-schedule/scripts/compute.mjs scenarios.json
```

## מבנה קובץ תרחישים

מערך של אובייקטים. `body` = גוף הבקשה (בלי token). `expect` (אופציונלי) =
שדות מהתשובה להשוואה. ראה `scenarios.example.json` בתיקיית הסקיל.

```json
[
  { "name": "תיאור קריא", "body": { "scheduleType": "הוראה", "layer": "יסודי", "enteredHours": 30, "...": "..." },
    "expect": { "ok": true, "finalHours": 30, "motherPosition": true } }
]
```

## שדות מרכזיים בתשובה

`ok`, `reason`/`message` (בכישלון), `finalHours`, `jobPercent`, `motherPosition`,
`frontalHours`, `individualHours`, `stayHoursInstitution`, `stayHoursHome`,
`utilizedHours`, `overBudget`, `additionalRoles`, `previousYear`,
`reducedVsLastYear`, `key`/`effectiveKey`. סיבות כישלון נפוצות:
`ofek_not_applicable` (scheduleType לא נמדד באופק), `ofek_not_found` (אין מבנה
שבוע תואם), `ofek_combined_not_found` (סכום כל התקנים לא עומד בתנאי).
