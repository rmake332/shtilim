---
name: airtable-schema
description: >-
  שליפה ומיפוי של סכימת ה-Airtable של פרויקט שתילים — fieldId ↔ שם ↔ type,
  איתור באיזו טבלה יושב שדה, וערכי choices של שדות בחירה. השתמש בסקיל הזה בכל
  פעם שצריך לדעת מזהה שדה או טבלה, לאמת שמזהה בקוד עדיין קיים, למפות שם עברי של
  שדה למזהה, או לברר אילו ערכים חוקיים יש ל-singleSelect/multipleSelects — גם
  כשהמשתמש לא אומר "סכימה" במפורש אלא שואל למשל "מה ה-fieldId של X" או "באיזו
  טבלה יושב Y". עדיף על שליפה ידנית של tool-results או ניחוש מזהים.
---

# מיפוי סכימת Airtable (שתילים)

הבסיס: `appKlvldLrk14ird8` (ברירת מחדל; נדרס ע"י `AIRTABLE_BASE_ID` ב-`.env.local`).
מקור האמת למזהי הטבלאות/שדות בקוד: `src/lib/airtable/schema.ts`.

## למה זה קיים

מזהי שדות (`fldXXX`) הם אטומים, ושמות שדה **חוזרים על עצמם בין טבלאות** — שדה מסמך
ש"עבר" מ`תקנים פעילים` ל`רשימת עובדים` שומר את השם אבל מקבל מזהה חדש. שימוש במזהה
ישן נכשל רק בזמן ריצה עם 403 שנראה כמו בעיית טוקן. לכן במקום לנחש או לגרוף קבצי
tool-results ידנית — שולפים את הסכימה החיה ומצליבים.

## הדרך המהירה: הסקריפט

```bash
# רשימת כל הטבלאות (key מ-schema.ts, tblId, שם, מס' שדות)
node .claude/skills/airtable-schema/scripts/field-map.mjs

# כל השדות בטבלה — לפי key מ-schema.ts, tblId, או שם עברי חלקי
node .claude/skills/airtable-schema/scripts/field-map.mjs activePositions
node .claude/skills/airtable-schema/scripts/field-map.mjs "תקנים פעילים"

# איתור שדה לפי שם בכל הבסיס (+ באיזו טבלה הוא יושב) — פותר את מלכודת השם הכפול
node .claude/skills/airtable-schema/scripts/field-map.mjs --find מוסד

# באיזו טבלה יושב fieldId, ומה שמו
node .claude/skills/airtable-schema/scripts/field-map.mjs --id fldZBF1Fw0aCcuONK

# כולל ערכי choices לשדות בחירה (id | name)
node .claude/skills/airtable-schema/scripts/field-map.mjs budget --choices
```

הסקריפט קורא `AIRTABLE_TOKEN` ו-`AIRTABLE_BASE_ID` מ-`.env.local`, בדיוק כמו
`scripts/verify-schema.mjs`. אין צורך בשרת dev — הוא פונה ישירות ל-Airtable meta API.

## אימות שהקוד תואם לסכימה

לפני הסתמכות על מזהים ב-`schema.ts`, ובעיקר אחרי שינוי שדות באיירטייבל, הרץ:

```bash
node scripts/verify-schema.mjs
```

הוא מוודא שכל fieldId שמוצהר תחת בלוק `*_FIELDS` באמת קיים בטבלה שהבלוק מתאר,
ומדווח לאיזו טבלה מזהה "יתום" באמת שייך. יוצא בקוד 1 כשמשהו לא מסתדר.

## חלופת MCP

כשה-`.env.local` לא זמין (למשל סשן ללא הטוקן), אפשר להשתמש בכלי ה-MCP של Airtable:
`list_tables_for_base` ואז `get_table_schema` (חובה לשדות בחירה כדי לקבל choice ids).
אבל כשהטוקן קיים — הסקריפט מהיר יותר, מרוכז, ולא מזהם context בפלט ענק.

## מפת הטבלאות המרכזיות (מ-schema.ts)

| key | tblId | טבלה |
|-----|-------|------|
| `employees` | tbl2jY3mzY279TsxU | רשימת עובדים |
| `activePositions` | tbl6nWUseVBUIylhV | תקנים פעילים (יעד כתיבה ראשי) |
| `prevYearPositions` | tblRy4vCSm7ePybx8 | תקנים תשפ"ו (קריאה בלבד) |
| `budget` | tblOL1fYEC9ZMOBE5 | תקציב התחלתי |
| `ofekCalc` | tbluSqfzeX9Ns452y | מחשבון אופק חדש |
| `bellSchedule` | tblmglINeMA2YItox | לוח צלצולים |
| `institutionSymbols` | tbl4BCMW4gwsIPxG7 | סמלי מוסד |
| `subRoles` | tblIEck6VDcpdfLFZ | תת-תפקידים |

הרשימה המלאה תמיד ב-`src/lib/airtable/schema.ts` — היא מקור האמת, לא הטבלה כאן.
