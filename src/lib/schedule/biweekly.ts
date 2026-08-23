/**
 * מערכת דו-שבועית (פנימיות): פעם בשבועיים יוצאים לחופשה ביום חמישי בשעה מוקדמת
 * יותר, לא עובדים ביום שישי של אותו השבוע, וחוזרים ביום ראשון בשעה מאוחרת יותר.
 * מוזנת מערכת שעות אחת בלבד — זו שמייצגת את השבוע ה"ארוך" (המלא). "המסלול" של
 * המוסד קובע את שעת הסיום בחמישי ואת שעת ההתחלה בראשון בשבוע המקוצר; ההפרש בין
 * מה שהוזן למסלול, בתוספת כל שעות יום שישי (יום שלם שלא מתקיים בשבוע המקוצר),
 * הוא ה"עודף". חצי מהעודף מנוכה רק מ"ניצול השעות בתקציב" — לא ממחשבון אופק
 * ולא מ-weeklyHours (ראה computeUtilizedHours ב-ofek.ts).
 *
 * Pure — נבדק ב-biweekly.test.ts.
 */
import { toMinutes, shiftMinutes, roundToHalf, type Shift } from './time';

export interface BiweeklyTrack {
  /** שעת סיום יום חמישי בשבוע המקוצר, בדקות מחצות. */
  thuEndMinutes: number;
  /** שעת התחלת יום ראשון בשבוע המקוצר, בדקות מחצות. */
  sunStartMinutes: number;
}

/**
 * שעות "עודפות" בשבוע המלא שהוזן, לעומת השבוע המקוצר: הפרש היציאה בחמישי
 * (משמרת אחרונה) מעל שעת המסלול, הפרש הכניסה בראשון (משמרת ראשונה) מתחת לשעת
 * המסלול, וסך שעות יום שישי שהוזנו. שלילי בכל רכיב נחתך ל-0 (רק חריגה נספרת).
 */
export function computeBiweeklyExcessHours(
  week: Record<string, Shift[]>,
  track: BiweeklyTrack,
): number {
  const thuShifts = week.thu ?? [];
  const sunShifts = week.sun ?? [];
  const friShifts = week.fri ?? [];

  const lastThuOut = thuShifts.length ? toMinutes(thuShifts[thuShifts.length - 1].out) : null;
  const firstSunIn = sunShifts.length ? toMinutes(sunShifts[0].in) : null;

  const thuExcessMin = lastThuOut != null ? Math.max(0, lastThuOut - track.thuEndMinutes) : 0;
  const sunExcessMin = firstSunIn != null ? Math.max(0, track.sunStartMinutes - firstSunIn) : 0;
  const friMinutes = friShifts.reduce((sum, s) => sum + shiftMinutes(s), 0);

  return (thuExcessMin + sunExcessMin + friMinutes) / 60;
}

/**
 * הניכוי בפועל מ"ניצול השעות בתקציב": חצי מהשעות העודפות, מעוגל לחצי השעה
 * הקרובה.
 */
export function computeBiweeklyDeductionHours(
  week: Record<string, Shift[]>,
  track: BiweeklyTrack,
): number {
  return roundToHalf(computeBiweeklyExcessHours(week, track) / 2);
}
