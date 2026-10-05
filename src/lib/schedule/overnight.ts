/**
 * משמרות לילה - משמרת שמתחילה ביום אחד ומסתיימת ביום שאחריו (למשל 22:00 עד 06:00).
 *
 * מותרות בפנימיות בלבד, לא לעובדי נוער, ולא ביום שישי (היציאה הייתה נופלת בשבת).
 * מוצ"ש שמסתיים בראשון בבוקר מותר. המשמרת כולה נרשמת ונספרת ביום הכניסה; באיירטייבל
 * נשמרות שעות הכניסה והיציאה כרגיל, ויציאה מוקדמת מהכניסה היא שמסמנת "למחרת".
 *
 * Pure - נבדק ב-overnight.test.ts.
 */
import { BOARDING_LAYER } from './breaks';
import { DAY_MINUTES, toMinutes, shiftEndMinutes, type Day, type Shift } from './time';

/** ימים שבהם משמרת אינה יכולה להסתיים למחרת. */
const NO_OVERNIGHT_DAYS = new Set<Day>(['fri']);

/** האם מותר להזין ביום זה משמרת שמסתיימת למחרת. */
export function overnightAllowed(day: Day, args: { layer: string; youth: boolean }): boolean {
  return args.layer === BOARDING_LAYER && !args.youth && !NO_OVERNIGHT_DAYS.has(day);
}

/** שם היום שבו מסתיימת משמרת לילה שהתחילה ביום `day`, לתצוגה. */
export const NEXT_DAY_LABEL: Record<Day, string> = {
  sun: 'שני',
  mon: 'שלישי',
  tue: 'רביעי',
  wed: 'חמישי',
  thu: 'שישי',
  fri: 'שבת',
  motzash: 'ראשון',
};

/** מיקום היום בשבוע. מוצ"ש הוא ערב שבת, אחרי שישי. */
const WEEK_INDEX: Record<Day, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, motzash: 6 };
const WEEK_MINUTES = 7 * DAY_MINUTES;

/** המשמרת כטווח דקות מתחילת השבוע (ראשון 00:00), או null כשהיא חסרה / לא תקינה. */
export function weekInterval(day: Day, s: Shift): [number, number] | null {
  const start = toMinutes(s.in);
  const end = shiftEndMinutes(s);
  if (start == null || end == null || end <= start) return null;
  const base = WEEK_INDEX[day] * DAY_MINUTES;
  return [base + start, base + end];
}

/**
 * חפיפה בין שתי משמרות, גם כשהן רשומות בימים שונים: משמרת לילה בראשון חופפת
 * למשמרת בוקר בשני. המערכת חוזרת כל שבוע, ולכן מוצ"ש שגולש לראשון נבדק גם מול
 * ראשון.
 */
export function weekShiftsOverlap(dayA: Day, a: Shift, dayB: Day, b: Shift): boolean {
  const x = weekInterval(dayA, a);
  const y = weekInterval(dayB, b);
  if (!x || !y) return false;
  return [-WEEK_MINUTES, 0, WEEK_MINUTES].some((off) => x[0] < y[1] + off && y[0] + off < x[1]);
}
