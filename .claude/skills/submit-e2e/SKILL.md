---
name: submit-e2e
description: >-
  בדיקת קצה-לקצה של שליחת טופס קליטת עובד בשתילים דרך /api/submit — בניית payload
  מלא (עובד + תפקיד + מערכת שעות + הסכמה) ושליחתו, כברירת מחדל מול שרת mock שלא
  נוגע ב-Airtable אמיתי. השתמש בסקיל הזה כשצריך לאמת את זרימת השליחה המלאה,
  לשחזר באג בשמירת תקן/עובד, לבדוק ולידציות שרת (ת.ז., תקרת 42 ש"ש, חריגת תקציב,
  כפילות), או לבדוק שינוי ב-submit לפני commit — במקום להדביק JSON ענק ב-curl.
---

# בדיקת שליחת טופס מקצה לקצה (שתילים)

`/api/submit` מקבל `{ token, employee, role, schedule, consent }`, מאמת מחדש
בשרת (ת.ז., תקרת 42 ש"ש, יתרת תקציב חיה, כפילות), וכותב **רשומה אחת** לטבלת
`תקנים פעילים` (+ עובד חדש אם `employee.recordId` הוא null).

## ⚠️ בטיחות: mock כברירת מחדל

מכיוון שהשליחה כותבת דאטה אמיתי, הכלי שולח כברירת מחדל למצב **mock** (פורט 3011,
טוקן `dev`), שמשתמש ב-fixtures ולא נוגע ב-Airtable. שליחה מול טוקן/סביבה אמיתית
חסומה אלא אם מועבר `--allow-real` במפורש. אל תשלח בדיקות מול Airtable אמיתי אלא
אם זו ממש הכוונה — זה יוצר רשומות אמיתיות.

## הפעלת שרת mock

בטרמינל נפרד:
```bash
AIRTABLE_MOCK=1 npx next dev -p 3011
```
מזהי ה-mock ב-`payload.example.json` (`recSymA`, `recRoleTempSubstitute`) תואמים
ל-fixtures של ה-mock. הטוקן במצב mock הוא `dev`.

## שליחה

```bash
# מעתיקים ומתאימים את payload.example.json
node .claude/skills/submit-e2e/scripts/submit.mjs payload.json
```

הסקריפט מזריק את הטוקן בעצמו (אין לכלול `token` ב-payload), מדפיס את קוד ה-HTTP
ואת גוף התשובה, ומחזיר קוד יציאה 1 אם `ok:false`. תשובת הצלחה כוללת את מזהה
הרשומה שנוצרה.

## מבנה ה-payload

שלושה בלוקים + הסכמה. ראה `payload.example.json` לשלד מלא.
- **`employee`**: `recordId` (null = עובד חדש), `tz` (ת.ז. תקינה — נבדקת בשרת),
  `name`, פרטי קשר, `gender`, `maritalStatus`, `childrenUnder14`, `birthDate`,
  `contractStartDate`, `noIsraeliId` (לזיהוי זר).
- **`role`**: `symbolId`, `roleId`, `roleTitle`, `category`, `scheduleType`
  (קובע את החישוב!), `layer`, `remainingHours`, גמולים/תפקידים נבחרים, דגלים
  (`paraBoard`, `ofekChadash`, `severeDisability`), `contractEndDate`.
- **`schedule`**: `week` (ימים→משבצות), `weeklyHours`, פירוק שעות
  (`frontalHours`/`individualHours`/`stayHoursInstitution`/`stayHoursHome`),
  `jobPercent`, `motherPosition`.

## ולידציות שרת ששווה לבדוק

- **ת.ז.** — `isValidIsraeliId` / `isValidForeignId` (ל-`noIsraeliId`). מספרי
  placeholder (000000000) נחסמים.
- **תקרת 42 ש"ש** — `checkWeeklyTotal` על כל תקני העובד בעמותה.
- **חריגת תקציב** — `checkLiveBudget` מול הערך החי (לא ה-snapshot של הלקוח).
- **כפילות** — `DuplicateSubmissionError` על שליחה חוזרת.

לוגיקה טהורה (ניצול שעות, אופק, ולידציית ת.ז.) עדיף לבדוק ב-vitest ישירות; הסקיל
הזה נועד לזרימה המלאה מול Airtable/mock. לבדיקת חישוב בלבד — `verify-schedule`.
