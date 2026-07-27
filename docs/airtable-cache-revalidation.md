# רענון קאש אוטומטי מאיירטייבל

## הרקע

רוב הקריאות לאיירטייבל בטופס הן חיות (`cache: 'no-store'` ב-`src/lib/airtable/client.ts`).
ארבע קריאות כבדות כן מקוששות כדי לשמור על מהירות טעינה:

| מה | קובץ | TTL | תגית |
|---|---|---|---|
| טבלת תקציב לכל מוסד | `src/lib/roles.ts` | 120 שנ' | `airtable-budget` |
| סמלי מוסד | `src/lib/symbols.ts` | 1800 שנ' | `airtable-symbols` |
| תקנים תשפ"ו לפי ת.ז. | `src/lib/prevYearPosition.ts` | 1800 שנ' | `airtable-prev-year` |
| רשימות בחירה (Meta API) | `src/lib/airtable/meta.ts` | 60 שנ' | `airtable-field-choices` |

בלי רענון יזום, שינוי באיירטייבל היה מופיע בטופס רק אחרי שה-TTL נגמר. ב-Vercel הקאש
משותף לכל המשתמשים, ולכן גם רענון של הדפדפן לא עוזר.

## הפתרון

`POST /api/revalidate` מוחק את תגיות הקאש הרלוונטיות. אוטומציה באיירטייבל קוראת לו
בכל שינוי רשומה, והנתונים החדשים מופיעים בטופס תוך שניות. ה-TTL נשאר כרשת ביטחון
למקרה שהאוטומציה כבויה או נכשלת.

## הגדרת משתנה הסביבה

```
REVALIDATE_SECRET=<מחרוזת אקראית ארוכה>
```

- מקומית: כבר קיים ב-`.env.local`.
- ב-Vercel: Settings → Environment Variables → להוסיף `REVALIDATE_SECRET` לכל
  הסביבות (Production / Preview / Development) ולעשות Redeploy.

בלי המשתנה הנתיב מחזיר `500 not_configured` - הוא לא נופל בשקט.

## הגדרת האוטומציה באיירטייבל

צריך אוטומציה אחת לכל טבלה שמשפיעה על הטופס. שלוש טבלאות:

| טבלה | `table` בגוף הבקשה |
|---|---|
| תקציב התחלתי | `tblOL1fYEC9ZMOBE5` |
| סמלי מוסד | `tbl4BCMW4gwsIPxG7` |
| תקנים תשפו | `tblRy4vCSm7ePybx8` |

לכל אחת:

1. **Automations → Create automation**, שם לדוגמה "רענון קאש - תקציב".
2. **Trigger: When record updated**
   - Table: הטבלה הרלוונטית.
   - Fields: להשאיר ריק (כל שדה) או לבחור רק את השדות שמשפיעים על הטופס.
   - כדאי להוסיף אוטומציה מקבילה עם **When record created** לאותה טבלה, אם מוסיפים
     שורות תקציב חדשות במהלך היום.
3. **Action: Run a script**
   פעולת "Send request" זמינה רק במסלולים גבוהים של איירטייבל, ולכן משתמשים בסקריפט.
   בסקריפט של אוטומציה (בניגוד לתוסף Scripting) `fetch` רץ בצד השרת של איירטייבל
   ולא חסום, אז אין צורך ב-`remoteFetchAsync`.

   להעתיק את התוכן של [`scripts/airtable-revalidate-automation.js`](../scripts/airtable-revalidate-automation.js)
   לתוך עורך הסקריפט, ולעדכן את שלושת הקבועים בראש הקובץ: `BASE_URL`, `SECRET`
   ו-`TABLE` (מזהה הטבלה שהאוטומציה הזו יושבת עליה).

   אין צורך ב-Input variables - הסקריפט לא נוגע ברשומה שהפעילה אותו, רק מנקה קאש.
4. **Test** - בלוג אמור להופיע `revalidate 200: {"revalidated":[...]}`.
   אם מופיע `401` - הסוד בסקריפט לא תואם ל-`REVALIDATE_SECRET` ב-Vercel.
   אם מופיע `500 not_configured` - המשתנה לא הוגדר ב-Vercel או שלא נעשה Redeploy.
5. **Turn on**.

> אפשר גם אוטומציה אחת בלי שדה `table` כלל - אז כל התגיות מתנקות. פשוט יותר, אבל
> מבטל גם קאשים שלא היה צריך לגעת בהם.

### הערת אבטחה

הסוד מופיע בגלוי בסקריפט, וכל מי שיש לו גישת עריכה לבייס יכול לראות אותו. לאיירטייבל
אין מאגר סודות לאוטומציות, אז זו המגבלה. הסיכון נמוך: הנתיב לא חושף נתונים ולא כותב
כלום - כל מה שאפשר לעשות איתו הוא לנקות קאש. אם הסוד דולף החוצה, מחליפים אותו
ב-Vercel ובשלושת הסקריפטים.

## בדיקה ידנית

```bash
curl -X POST "https://<דומיין>/api/revalidate" \
  -H "Content-Type: application/json" \
  -H "x-revalidate-secret: $REVALIDATE_SECRET" \
  -d '{"table":"tblOL1fYEC9ZMOBE5"}'
```

תשובה: `{"revalidated":["airtable-budget","airtable-symbols","airtable-field-choices"],"at":"..."}`

לניקוי הכל:

```bash
curl -X POST "https://<דומיין>/api/revalidate" \
  -H "x-revalidate-secret: $REVALIDATE_SECRET"
```

הנתיב מקבל את הסוד גם כ-`?secret=` בכתובת וגם בגוף ה-JSON, וגם תומך ב-GET - נוח
לבדיקה מהדפדפן, אבל בפרודקשן עדיף POST עם ה-header.

## פרמטרים

| פרמטר | ערכים | משמעות |
|---|---|---|
| `table` | `tblXXXX` או `budget` / `symbols` / `prev-year` / `choices` | אילו תגיות לנקות |
| `tags` | מערך של שמות תגיות מהטבלה למעלה | ניקוי מדויק, גובר על `table` |
| (ללא) | | ניקוי כל התגיות |

## מה לעשות כשמוסיפים קאש חדש

1. להוסיף תגית ל-`CACHE_TAGS` ב-`src/lib/cacheTags.ts`.
2. להעביר אותה ב-`tags` של `unstable_cache` / `fetch`.
3. למפות את הטבלה המתאימה ב-`TABLE_TAGS` באותו קובץ.
