/**
 * תקרת 42 שעות שבועיות לעובד - סה"כ כל התקנים שלו במערכת, לפי ת.ז.
 *
 * להבדיל מהתקרה שב-time.ts, שנבדקת מול מערכת השעות של התקן הנוכחי בלבד, כאן
 * מסכמים את השעות השבועיות של כל התקנים הפעילים של אותה ת.ז. (בכל המוסדות)
 * ומוסיפים להן את שעות התקן החדש/הנערך.
 *
 * מוחרגים מהתקרה:
 *  - עובד שמסומן לו "העסקה 12 שעות" ברשימת עובדים.
 *  - עובד פנימייה - שכבת התקן הנוכחי או של אחד מתקניו הקיימים היא "פנימיה".
 * שני אלה הם בדיוק המסלול שמקבל תקרה של 52 ש"ש ב-breaks.ts.
 *
 * Pure - נבדק ב-weeklyTotal.test.ts.
 */
import { formatNum } from '@/lib/formatNum';
import { WEEKLY_CAP_HOURS } from './time';
import { BOARDING_LAYER } from './breaks';

/** התקרה המשולבת לכל התקנים של אותה ת.ז. */
export const COMBINED_WEEKLY_CAP_HOURS = WEEKLY_CAP_HOURS;

/** סובלנות לשגיאות עיגול (שעות אקדמיות נגזרות מחילוק ב-45). */
const EPSILON = 1e-9;

/** תקן קיים של העובד, כפי שהוא נספר מול התקרה. */
export interface PositionHours {
  id: string;
  /** שם התפקיד + המוסד, לתצוגה בלבד. */
  name: string;
  /** שעות שבועיות של אותו תקן. */
  hours: number;
  /** שכבת התקן - "פנימיה" מפקיעה את התקרה. */
  layer: string;
}

/** האם העובד פטור מהתקרה המשולבת (פנימייה או "העסקה 12 שעות"). */
export function isCombinedCapExempt(args: {
  /** שכבת התקן הנוכחי (זה שמוזן עכשיו). */
  layer: string;
  twelveHourEmployment: boolean;
  /** תקניו הקיימים של העובד - די בתקן פנימייה אחד כדי לפטור. */
  positions: readonly PositionHours[];
}): boolean {
  if (args.twelveHourEmployment) return true;
  if (args.layer === BOARDING_LAYER) return true;
  return args.positions.some((p) => p.layer === BOARDING_LAYER);
}

/** סכום השעות השבועיות של התקנים הקיימים. */
export function sumPositionHours(positions: readonly PositionHours[]): number {
  return positions.reduce((sum, p) => sum + (Number.isFinite(p.hours) ? p.hours : 0), 0);
}

/** האם השעות המצטברות חורגות מהתקרה. */
export function isOverCombinedCap(newHours: number, existingHours: number): boolean {
  return newHours + existingHours > COMBINED_WEEKLY_CAP_HOURS + EPSILON;
}

/**
 * הודעת החריגה מהתקרה המשולבת, או null כשאין חריגה.
 * `exempt` (פנימייה / העסקה 12 שעות) מבטל את הבדיקה לגמרי.
 */
export function combinedCapError(args: {
  newHours: number;
  positions: readonly PositionHours[];
  exempt: boolean;
}): string | null {
  if (args.exempt) return null;
  const existingHours = sumPositionHours(args.positions);
  if (!isOverCombinedCap(args.newHours, existingHours)) return null;
  const total = args.newHours + existingHours;
  return (
    `לא ניתן להעסיק עובד ביותר מ-${COMBINED_WEEKLY_CAP_HOURS} שעות שבועיות בכל התקנים יחד ` +
    `(${formatNum(existingHours)} בתקנים קיימים + ${formatNum(args.newHours)} בתקן זה = ${formatNum(total)})`
  );
}
