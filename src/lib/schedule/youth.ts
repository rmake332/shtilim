/**
 * חוק העסקת נוער — אכיפה בפועל בהזנת מערכת השעות.
 *
 *  גיל 14–16 : עד 8 שעות ביום, עד 40 שעות בשבוע, לא לפני 08:00 ולא אחרי 20:00
 *  גיל 16–18 : עד 9 שעות ביום, עד 40 שעות בשבוע, לא לפני 06:00 ולא אחרי 22:00
 *
 * הטקסט המוצג לפקידה בשלב העובד (EmployeeStep) מנוסח לפי אותם ערכים.
 * Pure — נבדק ב-youth.test.ts.
 */
import { ageFromBirthDate } from '@/lib/formTypes';
import { formatNum } from '@/lib/formatNum';
import { toMinutes, shiftMinutes, type Shift } from './time';

export interface YouthLimits {
  /** מקסימום שעות עבודה ביום (סכום המשמרות, שעון ולא אקדמי). */
  maxDailyHours: number;
  /** מקסימום שעות עבודה בשבוע. */
  maxWeeklyHours: number;
  /** השעה המוקדמת ביותר שמותר להיכנס בה, "HH:MM". */
  earliest: string;
  /** השעה המאוחרת ביותר שמותר לצאת בה, "HH:MM". */
  latest: string;
}

const UNDER_16: YouthLimits = { maxDailyHours: 8, maxWeeklyHours: 40, earliest: '08:00', latest: '20:00' };
const AGE_16_TO_18: YouthLimits = { maxDailyHours: 9, maxWeeklyHours: 40, earliest: '06:00', latest: '22:00' };

/** מגבלות העסקת נוער לפי תאריך לידה, או null אם העובד בגיר (18+) / תאריך לא תקין. */
export function youthLimitsFor(birthDate: string | undefined): YouthLimits | null {
  const age = ageFromBirthDate(birthDate ?? '');
  if (age == null || age >= 18) return null;
  return age < 16 ? UNDER_16 : AGE_16_TO_18;
}

/** משפט תמצית להצגה בראש מערכת השעות. */
export function youthLimitsSummary(l: YouthLimits): string {
  return `עד ${l.maxDailyHours} שעות ביום ועד ${l.maxWeeklyHours} שעות בשבוע, לא לפני ${l.earliest} ולא אחרי ${l.latest}`;
}

/** האם שעה בודדת ("HH:MM") נמצאת בתוך חלון השעות המותר. שעה ריקה/לא תקינה — מותרת (נבדק במקום אחר). */
export function withinYouthWindow(hhmm: string, l: YouthLimits): boolean {
  const m = toMinutes(hhmm);
  if (m === null) return true;
  return m >= toMinutes(l.earliest)! && m <= toMinutes(l.latest)!;
}

/** הודעת שגיאה לשעה שמחוץ לחלון, או null אם היא מותרת. */
export function youthTimeError(hhmm: string, l: YouthLimits): string | null {
  const m = toMinutes(hhmm);
  if (m === null) return null;
  if (m < toMinutes(l.earliest)!) return `לא לפני ${l.earliest}`;
  if (m > toMinutes(l.latest)!) return `לא אחרי ${l.latest}`;
  return null;
}

/** האם רצועת לוח צלצולים מותרת להעסקת נוער (חלון שעות + אורך הרצועה). */
export function youthSlotAllowed(slot: { in: string; out: string }, l: YouthLimits): boolean {
  if (!withinYouthWindow(slot.in, l) || !withinYouthWindow(slot.out, l)) return false;
  return shiftMinutes({ in: slot.in, out: slot.out }) <= l.maxDailyHours * 60;
}

/**
 * שגיאת יום בודד לפי חוק העסקת נוער — חלון שעות ואז מכסה יומית.
 * מחזיר null כשהיום תקין.
 */
export function youthDayError(shifts: Shift[], l: YouthLimits): string | null {
  for (const s of shifts) {
    if (!withinYouthWindow(s.in, l))
      return `העסקת נוער — כניסה לפני ${l.earliest} אסורה`;
    if (!withinYouthWindow(s.out, l))
      return `העסקת נוער — יציאה אחרי ${l.latest} אסורה`;
  }
  const dayMin = shifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
  if (dayMin > l.maxDailyHours * 60)
    return `העסקת נוער — עד ${l.maxDailyHours} שעות ביום (הוזנו ${formatNum(dayMin / 60)})`;
  return null;
}

/** הודעת חריגה מהמכסה השבועית, או null. */
export function youthWeeklyError(weeklyHours: number, l: YouthLimits): string | null {
  if (weeklyHours <= l.maxWeeklyHours) return null;
  return `העסקת נוער — עד ${l.maxWeeklyHours} שעות שבועיות (הוזנו ${formatNum(weeklyHours)})`;
}
