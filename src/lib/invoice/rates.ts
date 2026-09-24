/**
 * חישובי תקני חשבונית שאינם תלויים באיירטייבל - משותפים לשרת ולרכיבי הלקוח.
 *
 * מודל השעות: "סך שעות בתקציב" בשורת התקציב ו"שעות מוקצות" בתקן הם **שבועיים**.
 * הדיווח החודשי מדווח שעות חודשיות, ולכן המכסה לחודש נגזרת מהמכסה השבועית כפול
 * מספר השבועות בחודש לפי ימי העבודה בו (ראו weeksInMonth).
 */

/** מקדם המרה בין שעות חודשיות לשבועיות (ממוצע שבועות בחודש). */
export const WEEKS_PER_MONTH = 4.3;
/** מרווח מעל התעריף הממוצע שמותר לתעריף שעתי מוסכם. */
export const MAX_RATE_FACTOR = 1.2;
/** תקרה מוחלטת לתעריף שעתי, כולל מע"מ. */
export const MAX_RATE_CAP = 350;
/** ימי עבודה בשבוע (ראשון עד חמישי). */
export const WORK_DAYS_PER_WEEK = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * תעריף שעתי מקסימלי (כולל מע"מ) = תעריף חודשי / (שעות שבועיות * 4.3) * 1.2, ועד
 * 350 ש"ח. null כשאין שעות או תעריף. זהה לנוסחה בשדה "תעריף שעתי מקסימלי" בתקציב.
 */
export function maxHourlyRateFor(tariffMonthly: number, weeklyHours: number): number | null {
  if (!(weeklyHours > 0) || !(tariffMonthly > 0)) return null;
  return Math.min(MAX_RATE_CAP, round2((tariffMonthly / (weeklyHours * WEEKS_PER_MONTH)) * MAX_RATE_FACTOR));
}

/** שעות חודשיות שהוזנו בהקצאה -> שעות שבועיות לשמירה. */
export function monthlyToWeekly(monthlyHours: number): number {
  return round2(monthlyHours / WEEKS_PER_MONTH);
}

/** מספר ימי העבודה (ראשון עד חמישי) בחודש "YYYY-MM". */
export function workDaysInMonth(month: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return 0;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const days = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(Date.UTC(year, monthIdx, d)).getUTCDay();
    if (dow <= 4) count++;
  }
  return count;
}

/** מספר השבועות בחודש לפי ימי העבודה בו (על בסיס 5 ימי עבודה בשבוע). */
export function weeksInMonth(month: string): number {
  return workDaysInMonth(month) / WORK_DAYS_PER_WEEK;
}

/** מכסת השעות לחודש = שעות שבועיות * שבועות העבודה בחודש. */
export function monthlyHoursFor(weeklyHours: number, month: string): number {
  return round2(weeklyHours * weeksInMonth(month));
}
