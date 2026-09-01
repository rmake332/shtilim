import 'server-only';
import { escapeFormulaValue } from '@/lib/airtable/client';
import { isIsraeliIdShaped, normalizeIsraeliId } from '@/lib/validation/israeliId';
import { normalizeForeignId } from '@/lib/validation/foreignId';
import { isPlaceholderId } from '@/lib/validation/placeholderId';

/**
 * ניקוי הערך *המאוחסן* באיירטייבל בתוך הנוסחה: TRIM + הסרת רווחים ומקפים פנימיים
 * + אחידות רישיות. בלי זה נוצרות כפילויות: השדה הוא טקסט חופשי ובפועל מאוחסנות בו
 * צורות שונות של אותה ת.ז. - "54733068" בלי ריפוד אפסים, "21872231-2" עם מקף - ורק
 * הצד שהוקלד נורמל, כך שהתאמה מדויקת החמיצה את הרשומה הקיימת ונוצרה רשומה שנייה.
 */
export function cleanedTzField(fieldId: string): string {
  return `UPPER(SUBSTITUTE(SUBSTITUTE(TRIM({${fieldId}})," ",""),"-",""))`;
}

/**
 * בניית תנאי OR(...) להתאמה מדויקת של שדה ת.ז./זיהוי זר באיירטייבל.
 * שני הצדדים מנורמלים: הערך המאוחסן דרך cleanedTzField, והקלט לרשימת הצורות שבהן הוא
 * עשוי להיות מאוחסן.
 * ת.ז. ישראלית (1-9 ספרות) - מרופדת ל-9 וגם בלי אפסים מובילים, כי ת.ז. מאוחסנות
 * לפעמים לא מרופדות. כל דבר אחר (זיהוי זר) - גולמי + מנורמל-זר (uppercase, בלי
 * רווחים/מקפים) - לעולם לא digit-stripped, כדי שלא יתאפשר לשני מספרי זיהוי זרים
 * שונים עם אותה סדרת ספרות (למשל "AB1234567" מול "CD1234567") להתנגש.
 */
export function buildTzExactMatchFormula(tz: string, fieldId: string): string | null {
  const trimmed = String(tz).trim();
  if (!trimmed) return null;
  // ממלא מקום (למשל "000000000") אינו מזהה איש, אבל בטבלה יש 16 רשומות שנשמרו איתו.
  // בלי החסימה כאן, הקלדתו הייתה מתאימה לאחת מהן ובוחרת אוטומטית אדם אקראי - והתקן
  // היה נוצר על עובד לא קשור. null = "אין התאמה", בכל מסלולי ההתאמה לפי ת.ז.
  if (isPlaceholderId(trimmed)) return null;

  const raw = isIsraeliIdShaped(trimmed)
    ? (() => {
        const padded = normalizeIsraeliId(trimmed) as string;
        // "000000000" לעולם לא ת.ז. תקינה, אבל בלי הנפילה ל-padded היינו משווים
        // למחרוזת ריקה - שמתאימה לכל רשומה עם שדה ת.ז. ריק.
        return [padded, padded.replace(/^0+/, '') || padded];
      })()
    : [trimmed, normalizeForeignId(trimmed)].filter((v): v is string => Boolean(v));

  const uniq = Array.from(new Set(raw.map((v) => v.toUpperCase())));
  const field = cleanedTzField(fieldId);
  return uniq.length === 1
    ? `${field}="${escapeFormulaValue(uniq[0])}"`
    : `OR(${uniq.map((v) => `${field}="${escapeFormulaValue(v)}"`).join(',')})`;
}
