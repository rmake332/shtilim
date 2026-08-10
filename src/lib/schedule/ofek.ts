/**
 * "מחשבון אופק חדש" key building and the derived computations (mother-position,
 * severe-disability bonus, job percent, stay-hours split). Pure & unit-tested.
 */

export interface MotherPositionInput {
  gender: string; // 'נקבה' | 'זכר'
  maritalStatus: string;
  hasChildrenUnder14: boolean;
  jobPercent: number;
}

/** נתוני העובד הקובעים משרת אם, למעט אחוז המשרה שנגזר מהשעות. */
export interface MotherEmployeeInput {
  gender: string;
  maritalStatus: string;
  hasChildrenUnder14: boolean;
  /** שעות גיל - מופחתות מ-36 לקבלת בסיס אחוז המשרה. */
  ageHours: number | string;
}

/** משרת אם = כן only if: female, not single, has children <14, job% >= 79. */
export function isMotherPosition({
  gender,
  maritalStatus,
  hasChildrenUnder14,
  jobPercent,
}: MotherPositionInput): boolean {
  if (gender !== 'נקבה') return false;
  if (maritalStatus.includes('רווק')) return false; // רווק/ה
  if (!hasChildrenUnder14) return false;
  return jobPercent >= 79;
}

/** שבוע משרה מלאה, לפני הפחתת שעות גיל. */
export const FULL_TIME_WEEK_HOURS = 36;

/**
 * בסיס אחוז המשרה: 36 בניכוי שעות הגיל של העובד. עובדת עם 2 שעות גיל נמדדת
 * מול 34, עם 4 שעות גיל מול 32, וללא שעות גיל מול 36.
 *
 * שעות גיל שאינן קטנות מ-36 הן נתון בלתי אפשרי; במקרה כזה נשמר בסיס 36 כדי
 * לא לחלק באפס או במספר שלילי.
 */
export function jobPercentBase(ageHours: number | string): number {
  const base = FULL_TIME_WEEK_HOURS - (Number(ageHours) || 0);
  return base > 0 ? base : FULL_TIME_WEEK_HOURS;
}

/** Job percent = (total final hours / (36 - שעות גיל)) * 100. */
export function jobPercent(finalHours: number, ageHours: number | string): number {
  return (finalHours / jobPercentBase(ageHours)) * 100;
}

/** השעות שמחשבון אופק חדש מחזיר לשורה. */
export interface OfekRowHours {
  frontalHours: number;
  individualHours: number;
  stayHours: number;
}

/** סכום השעות שחזרו מהמחשבון: פרונטלי + פרטני + שהייה. */
export function ofekRowHoursSum(row: OfekRowHours): number {
  return row.frontalHours + row.individualHours + row.stayHours;
}

/**
 * חישוב מחדש של משרת אם לפי הפלט של מחשבון אופק חדש.
 *
 * שני תיקונים לאחוז המשרה שנגזר מהשעות שהוזנו:
 *
 * 1. בפרא השעות שבמפתח הן פרונטלי+פרטני בלבד והשהייה נוספת מעליהן, ולכן היקף
 *    המשרה האמיתי של התקן הוא סכום השעות שחזר מהמחשבון ולא השעות שהוזנו.
 * 2. משרת אם נקבעת לפי היקף ההעסקה הכולל של העובד, ולכן `otherScopeHours` -
 *    סכום פרונטלי+פרטני+שהייה של יתר תקני העובד במערכת - נוסף לחישוב.
 *
 * השליפה הראשונה מהמחשבון היא מעבר ביניים בלבד; הערך שמתקבל כאן הוא הקובע.
 */
export function motherPositionFromOfekRow(
  row: OfekRowHours,
  input: MotherEmployeeInput,
  otherScopeHours = 0,
): { jobPercent: number; motherPosition: boolean } {
  const pct = jobPercent(ofekRowHoursSum(row) + otherScopeHours, input.ageHours);
  return { jobPercent: pct, motherPosition: isMotherPosition({ ...input, jobPercent: pct }) };
}

/**
 * Ofek lookup key = שכבה + שעות_גיל + משרת_אם + קטגוריה + סך_שעות_סופי
 * Example: "חטיבה0כןהוראה5"
 */
export function buildOfekKey(params: {
  layer: string;
  ageHours: number | string;
  motherPosition: boolean;
  category: string; // הוראה | פרא
  totalHours: number;
}): string {
  const mother = params.motherPosition ? 'כן' : 'לא';
  return `${params.layer}${params.ageHours}${mother}${params.category}${params.totalHours}`;
}

export interface SevereDisabilityInput {
  severeDisabilityFlag: boolean; // לקות קשה checkbox on budget
  enteredHours: number; // sum of entered schedule hours
}

/**
 * Severe-disability hour bonus:
 *  - 0 if flag off
 *  - +1 if enteredHours < 15
 *  - +2 if enteredHours >= 15
 *
 * נתון סטטי לידיעת המשתמש בלבד: התוספת אינה נכנסת לחישוב מחשבון אופק חדש
 * ואינה מנוצלת מ"סה״כ שעות לניצול" של התקן. היא רק מוצגת ונשמרת לתקן.
 */
export function severeDisabilityBonus({
  severeDisabilityFlag,
  enteredHours,
}: SevereDisabilityInput): number {
  if (!severeDisabilityFlag) return 0;
  return enteredHours < 15 ? 1 : 2;
}

export interface StaySplitInput {
  paraBoard: boolean;
  layer: string;
  category: string;
  isBehaviorAnalyst: boolean;
}

/** Returns 'institution' (מהמוסד) or 'home' (מהבית) for para stay hours. */
export function paraStaySplit({
  paraBoard,
  layer,
  category,
  isBehaviorAnalyst,
}: StaySplitInput): 'institution' | 'home' {
  // מהמוסד if: paraBoard OR layer=גנים OR (layer=גנים + behavior-analyst)
  if (paraBoard || layer === 'גנים') return 'institution';
  // מהבית if: !paraBoard + layer≠גנים + category≠הוראה + !behavior-analyst
  if (!paraBoard && layer !== 'גנים' && category !== 'הוראה' && !isBehaviorAnalyst) {
    return 'home';
  }
  return 'institution';
}

/** Per-day para hours: total daily minutes divided by 45 (academic units). */
export function paraDailyUnits(dailyMinutes: number): number {
  return dailyMinutes / 45;
}

/**
 * הזנת שעות בסגנון פרא - הקלדת כניסה/יציאה וספירה בשעות אקדמיות (נוסחת ÷45).
 * הקובע הוא סוג מערכת השעות ולא הקטגוריה: תקן בקטגוריית "פרא רפואי" שסוג מערכת
 * השעות שלו "רגיל" נספר בשעות שעון ככל תקן רגיל, כולל ניכוי הפסקות.
 */
export function isParaEntry(scheduleType: string | null | undefined): boolean {
  return scheduleType === 'פרא' || scheduleType === 'הוראה - לוח פרא';
}

/**
 * קטגוריית מחשבון אופק חדש הנגזרת מסוג מערכת השעות, או null כשהתקן אינו נדרש לאופק.
 * "הוראה - לוח פרא" מוזן כמו פרא אך מחושב באופק כמו הוראה.
 */
export function ofekCategoryFor(scheduleType: string | null | undefined): 'פרא' | 'הוראה' | null {
  if (scheduleType === 'פרא') return 'פרא';
  if (scheduleType === 'הוראה' || scheduleType === 'הוראה - לוח פרא') return 'הוראה';
  return null;
}

/**
 * סה"כ שעות לניצול = frontal + individual + stay.
 * גנים (הוראה ופרא): כולל שהייה. יסודי / חטיבה: ללא שהייה → frontal + individual בלבד.
 * נופל חזרה ל-weeklyHours כשהאופק עדיין לא חושב (למשל מערכת שעות "רגיל").
 */
export function computeUtilizedHours(
  layer: string | null | undefined,
  hours: {
    weeklyHours?: number;
    frontalHours?: number;
    individualHours?: number;
    stayHoursInstitution?: number;
    stayHoursHome?: number;
  },
): number {
  const { frontalHours = 0, individualHours = 0, stayHoursInstitution = 0, stayHoursHome = 0 } = hours;
  const isGanim = layer === 'גנים';
  const stay = isGanim ? stayHoursInstitution + stayHoursHome : 0;
  const total = frontalHours + individualHours + stay;
  return total > 0 ? total : (hours.weeklyHours ?? 0);
}
