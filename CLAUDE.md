# הוראות פרויקט - טופס קליטת עובד (שתילים)

## תיעוד המערכת

מפת הארכיטקטורה של המערכת נמצאת ב-`docs/system-overview.md`.

**כלל קבוע: בכל פעם שפיצ'ר חדש מושלם (לא תיקון קטן/רפקטור) - יש לעדכן את
`docs/system-overview.md`** כך שהמסמך ימשיך לשקף נכון את המערכת. אם הפיצ'ר משנה
זרימת משתמש, טבלת/שדה Airtable, לוגיקת חישוב מרכזית, או מודול בפורטל - זה המקום
לעדכן. שינויים קטנים/פנימיים לא מצריכים עדכון.

## הרצה מקומית

- `npm run dev` - הסקריפט כבר כולל `-p 3010`, אין להוסיף עוד `-p 3010`. השרת רץ על
  פורט 3010, מול Airtable אמיתי (`AIRTABLE_MOCK=0` דרך `.env.local`).
- טוקן בדיקה (מוסד אמיתי): `shtilim-123456` → `http://localhost:3010/form/shtilim-123456`
- **כלל זהב: לעולם לא להריץ `npm run build` בזמן שה-dev server רץ** - זה דורס את
  `.next` וגורם לשרת הרץ לקרוס (`Cannot find module`, `Unexpected end of JSON input`).
  לבדיקת טייפים תוך כדי ריצת dev - `npx tsc --noEmit`. `npm test` (vitest) בטוח,
  לא נוגע ב-`.next`.
- אם `.next` נשבר: לעצור את השרת → למחוק את התיקייה `.next` → `npm run dev` מחדש.
- שרת תקוע/orphaned על פורט 3010:
  `Get-NetTCPConnection -LocalPort 3010 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`
- רשימת בחירה מציגה ערך ישן אחרי שינוי באיירטייבל? זה קאש -
  `Remove-Item .next\cache\fetch-cache -Recurse -Force` (בטוח לעשות בזמן שהשרת רץ).
- בדיקות ב-`src/**/*.test.ts` (vitest) - ייבוא יחסי, לא alias `@/` (לא resolved
  בקונפיג הבדיקות).
- מותר להריץ פקודות טרמינל של תהליך הפיתוח (dev server, build, test, curl) ישירות
  בלי לעצור ולשאול אישור מראש.

## מוסכמות קוד

- **`scheduleType`** (מ-תקציב התחלתי), **לא `category`**, הוא הקובע איך מוזנות
  ונספרות שעות ואם רץ מחשבון אופק. המקור היחיד: `isParaEntry` / `ofekCategoryFor`
  ב-`src/lib/schedule/ofek.ts`. אין להשוות `category === 'פרא רפואי'` ישירות בקוד
  חדש.
- כל מספר שמוצג ב-UI מעוצב דרך `formatNum` (`src/lib/formatNum.ts`) - עד 2 ספרות
  עשרוניות, בלי אפסים מיותרים. לא `toFixed(2)` ישיר.
- `mosadId` (מזהה מוסד) תמיד נגזר בשרת מהטוקן דרך `gateByToken` - לעולם לא מתקבל
  מגוף הבקשה של הלקוח (הגנת IDOR).

## Git

- `git add` ו-`git commit` מותרים כחלק שוטף מהעבודה. **`git push` - רק אחרי בקשה
  מפורשת של המשתמש**, בכל שיחה מחדש.

## תקשורת עם המשתמש

- סיכומי עבודה/recap בסוף משימה - תמיד בעברית.
