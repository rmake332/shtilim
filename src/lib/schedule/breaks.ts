/**
 * הפסקות — אכיפה בפועל בהזנת מערכת השעות.
 *
 * יום שעולה על 8.5 שעות מחייב הזנת הפסקה (כניסה ויציאה). גודל ההפסקה תלוי
 * בסוג המערכת ובעובד, אך היא אינה מנוכה מסך השעות הנספרות מול התקציב באף מסלול:
 *
 *  רגיל / סגן ראשון          : ההפסקה משלימה ל-8.5 שעות עבודה (נוכחות − 8.5).
 *  פרא / הוראה / לוח פרא     : חצי שעה בדיוק; השעות האקדמיות נגזרות מהנוסחה שלהן בלבד.
 *  פנימיה / "העסקה 12 שעות"  : חצי שעה בדיוק; בנוסף מנוחת 8 שעות בין ימים ותקרה של 52 ש"ש.
 *
 * המדד שנבדק מול הסף של 8.5 הוא שעות שעון במסלול ה"שעון" ושעות אקדמיות במסלול
 * ה"אקדמי" — לכן הקורא מעביר את שעות היום כבר במדד הנכון (ראה `BreakPolicy.metric`).
 *
 * תקרת 12 שעות נוכחות ליום חלה על כל העובדים ובכל סוגי המערכת.
 * Pure — נבדק ב-breaks.test.ts.
 */
import { formatNum } from '@/lib/formatNum';
import { toMinutes, shiftMinutes, shiftEndMinutes, isOvernight, DAY_MINUTES, type Shift } from './time';

/** יום שסכום שעותיו עולה על הסף מחייב הפסקה. */
export const BREAK_THRESHOLD_HOURS = 8.5;
/** תקרת נוכחות יומית — חלה על כל העובדים. */
export const MAX_DAILY_PRESENCE_HOURS = 12;
/** תקרה שבועית במסלול פנימיה / העסקה 12 שעות (במקום WEEKLY_CAP_HOURS). */
export const TWELVE_HOUR_WEEKLY_CAP = 52;
/** מנוחה מזערית בין סיום יום אחד לתחילת היום שאחריו (מסלול 12 שעות בלבד). */
export const MIN_REST_HOURS = 8;
/** ההפסקה הקבועה, בדקות, בכל מסלול שאינו "השלמה ל-8.5". */
export const FIXED_BREAK_MINUTES = 30;
/** שכבת המוסד שמפעילה את מסלול 12 השעות. */
export const BOARDING_LAYER = 'פנימיה';

/** סוגי מערכת שעות שבהם השעות הנספרות הן אקדמיות ולא שעות שעון. */
const ACADEMIC_SCHEDULE_TYPES = new Set([
  'פרא',
  'הוראה',
  'עוז',
  'הוראה - לוח פרא',
  'הוראה ללא שהייה',
  'הוראה ללא אופק חדש',
]);

export interface BreakPolicy {
  /** פנימיה או "העסקה 12 שעות" על העובד. */
  twelveHour: boolean;
  /** לפי מה נמדדות שעות היום מול הסף של 8.5. */
  metric: 'clock' | 'academic';
  /** חצי שעה בדיוק, במקום השלמה ל-8.5 שעות עבודה. */
  fixedHalfHour: boolean;
}

/** מדיניות ההפסקה לפי סוג המערכת, שכבת התקן ודגל העובד. */
export function breakPolicyFor(args: {
  scheduleType: string | null;
  layer: string;
  twelveHourEmployment: boolean;
}): BreakPolicy {
  const twelveHour = args.layer === BOARDING_LAYER || Boolean(args.twelveHourEmployment);
  const metric: BreakPolicy['metric'] = ACADEMIC_SCHEDULE_TYPES.has(args.scheduleType ?? '')
    ? 'academic'
    : 'clock';
  return {
    twelveHour,
    metric,
    fixedHalfHour: twelveHour || metric === 'academic',
  };
}

/**
 * דקות ההפסקה הנדרשות ליום. 0 = לא נדרשת הפסקה.
 * `dayHours` הוא במדד של המדיניות (שעות שעון או שעות אקדמיות).
 */
export function requiredBreakMinutes(dayHours: number, p: BreakPolicy): number {
  // סובלנות זעירה לשגיאות עיגול בשעות אקדמיות (חילוק ב-45).
  if (dayHours <= BREAK_THRESHOLD_HOURS + 1e-9) return 0;
  if (p.fixedHalfHour) return FIXED_BREAK_MINUTES;
  return Math.round((dayHours - BREAK_THRESHOLD_HOURS) * 60);
}

/** "45 דק׳" / "שעה" / "1.5 שעות" — ניסוח קצר להצגה בהודעות. */
export function formatBreakMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`;
  if (minutes === 60) return 'שעה';
  return `${formatNum(minutes / 60)} שעות`;
}

/** משך ההפסקה בדקות, או 0 אם היא ריקה / לא תקינה. */
export function breakMinutes(brk: Shift | undefined): number {
  if (!brk) return 0;
  return shiftMinutes(brk);
}

/** סכום דקות ההפסקה של השבוע (לניכוי מהשעות הנספרות). */
export function totalBreakMinutes(breaks: Record<string, Shift | undefined>, days: readonly string[]): number {
  let total = 0;
  for (const d of days) total += breakMinutes(breaks[d]);
  return total;
}

/**
 * שגיאת ההפסקה של יום בודד, או null כשהיום תקין.
 * `dayHours` במדד של המדיניות; `shifts` הן משמרות הנוכחות של אותו יום.
 */
export function breakDayError(
  shifts: Shift[],
  brk: Shift | undefined,
  dayHours: number,
  p: BreakPolicy,
): string | null {
  const required = requiredBreakMinutes(dayHours, p);
  if (required === 0) return null;

  const label = formatBreakMinutes(required);
  const rawIn = toMinutes(brk?.in ?? '');
  const rawOut = toMinutes(brk?.out ?? '');
  if (rawIn === null && rawOut === null)
    return `יום עם ${formatNum(dayHours)} שעות — נדרשת הזנת הפסקה של ${label}`;
  if (rawIn === null || rawOut === null) return 'יש למלא כניסה ויציאה להפסקה';

  const starts = shifts.map((s) => toMinutes(s.in)).filter((m): m is number => m !== null);
  const ends = shifts.map(shiftEndMinutes).filter((m): m is number => m !== null);
  const firstIn = starts.length > 0 ? Math.min(...starts) : null;
  // ביום עם משמרת לילה, שעה שקודמת לתחילת העבודה היא אחרי חצות - כלומר למחרת.
  const overnight = shifts.some(isOvernight);
  const onTimeline = (m: number) => (overnight && firstIn !== null && m < firstIn ? m + DAY_MINUTES : m);
  const inMin = onTimeline(rawIn);
  const outMin = onTimeline(rawOut);
  if (outMin <= inMin) return 'שעת היציאה מההפסקה מוקדמת משעת הכניסה אליה';

  // ההפסקה חייבת לשבת בתוך טווח העבודה של אותו יום.
  if (firstIn !== null && ends.length > 0) {
    const lastOut = Math.max(...ends);
    if (inMin < firstIn || outMin > lastOut)
      return 'ההפסקה חייבת להיות בתוך שעות העבודה של אותו יום';
  }

  const actual = outMin - inMin;
  if (actual !== required) {
    return p.fixedHalfHour
      ? `ההפסקה חייבת להיות ${label} בדיוק (הוזנו ${formatBreakMinutes(actual)})`
      : `ההפסקה משלימה ל-${BREAK_THRESHOLD_HOURS} שעות עבודה — נדרשות ${label} (הוזנו ${formatBreakMinutes(actual)})`;
  }
  return null;
}

/** חריגה מתקרת הנוכחות היומית (12 שעות), או null. חל על כל העובדים. */
export function dailyPresenceError(shifts: Shift[]): string | null {
  const min = shifts.reduce((sum, s) => sum + shiftMinutes(s), 0);
  if (min <= MAX_DAILY_PRESENCE_HOURS * 60) return null;
  return `לא ניתן לעבוד יותר מ-${MAX_DAILY_PRESENCE_HOURS} שעות ביום (הוזנו ${formatNum(min / 60)})`;
}

/**
 * מנוחת 8 שעות בין סיום היום הקודם לתחילת היום הנוכחי — מסלול 12 שעות בלבד.
 * ימים ריקים אינם מייצרים בדיקה. מחזיר null כשהמנוחה תקינה.
 */
export function restBetweenDaysError(prev: Shift[], curr: Shift[]): string | null {
  // משמרת לילה ביום הקודם מסתיימת כבר בתוך היום הנוכחי (יציאה מעל 24 שעות).
  const prevEnds = prev.map(shiftEndMinutes).filter((m): m is number => m !== null);
  const currStarts = curr.map((s) => toMinutes(s.in)).filter((m): m is number => m !== null);
  if (prevEnds.length === 0 || currStarts.length === 0) return null;
  const lastOut = Math.max(...prevEnds);
  const firstIn = Math.min(...currStarts);
  const restMin = DAY_MINUTES - lastOut + firstIn;
  if (restMin < 0) return 'העבודה ביום זה מתחילה לפני שמשמרת הלילה של היום הקודם מסתיימת';
  if (restMin >= MIN_REST_HOURS * 60) return null;
  return `נדרשת מנוחה של ${MIN_REST_HOURS} שעות מסיום היום הקודם (הוזנו ${formatNum(restMin / 60)})`;
}
