import 'server-only';
import { escapeFormulaValue } from '@/lib/airtable/client';
import { isIsraeliIdShaped, normalizeIsraeliId } from '@/lib/validation/israeliId';
import { normalizeForeignId } from '@/lib/validation/foreignId';

/**
 * בניית תנאי OR(...) להתאמה מדויקת של שדה ת.ז./זיהוי זר באיירטייבל.
 * ת.ז. ישראלית (1-9 ספרות) - נשאר בדיוק כמו היום (מנורמל+גולמי, כי ת.ז. מאוחסנות
 * לפעמים לא מרופדות). כל דבר אחר (זיהוי זר) - גולמי + מנורמל-זר (uppercase, בלי
 * רווחים/מקפים) - לעולם לא digit-stripped, כדי שלא יתאפשר לשני מספרי זיהוי זרים
 * שונים עם אותה סדרת ספרות (למשל "AB1234567" מול "CD1234567") להתנגש.
 */
export function buildTzExactMatchFormula(tz: string, fieldId: string): string | null {
  const trimmed = String(tz).trim();
  if (!trimmed) return null;
  const variants = isIsraeliIdShaped(trimmed)
    ? [normalizeIsraeliId(trimmed) as string, trimmed]
    : [trimmed, normalizeForeignId(trimmed)].filter((v): v is string => Boolean(v));
  const uniq = Array.from(new Set(variants));
  return uniq.length === 1
    ? `{${fieldId}}="${escapeFormulaValue(uniq[0])}"`
    : `OR(${uniq.map((v) => `{${fieldId}}="${escapeFormulaValue(v)}"`).join(',')})`;
}
