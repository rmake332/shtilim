/**
 * חותמת ניכוי הפרא - תיעוד מה קרה בפועל עם ניכוי ה-35/40 בכל יום של התקן.
 *
 * למה חותמת ולא גזירה: אפשר לנסות להסיק מתקן קיים אם נוכה בו ("הוא פרא וגם מעל
 * 80 דקות, אז כנראה נוכה"), אבל ההסקה הזו טועה בדיוק במקרה שחשוב - תקן פרא
 * שבעצמו דילג על הניכוי כי תקן שלישי החזיק אותו באותו יום. הגזירה מריצה את
 * כללי היום על נתוני העבר, וזו בדיוק התקלה שהחותמת נועדה למנוע: תקן ששמור עם
 * שעות תקינות התחיל לקבל מספר אחר בעריכה, רק כי המציאות סביבו השתנתה.
 *
 * הפורמט: `ב:0 (הדרכה פרא), ד:40` - בכל יום עבודה, כמה דקות נוכו בפועל. אפס
 * פירושו שדולג, ובסוגריים התקן שהחזיק את הניכוי במקומו.
 *
 * Pure - נבדק ב-paraDeductionStamp.test.ts.
 */
import { DAYS, type Day } from './time';

export const PARA_DEDUCTION_STATUS = {
  deducted: 'נוכה',
  partial: 'ניכוי חלקי',
  skipped: 'תקן נוסף ללא ניכוי',
  notApplicable: 'לא נדרש',
} as const;

export type ParaDeductionStatus =
  (typeof PARA_DEDUCTION_STATUS)[keyof typeof PARA_DEDUCTION_STATUS];

/** אות היום בחותמת. מוצ"ש אינו נכלל: הזנת פרא רצה על ראשון עד שישי בלבד. */
const DAY_LETTER: Record<(typeof DAYS)[number], string> = {
  sun: 'א',
  mon: 'ב',
  tue: 'ג',
  wed: 'ד',
  thu: 'ה',
  fri: 'ו',
};
const LETTER_DAY = new Map<string, Day>(
  Object.entries(DAY_LETTER).map(([d, letter]) => [letter, d as Day]),
);

/** ניכוי של יום עבודה אחד. `minutes: 0` = דולג. */
export interface DayDeduction {
  day: Day;
  /** הדקות שנוכו בפועל: 35, 40, או 0 כשדולג. */
  minutes: number;
  /** שם התקן שהחזיק את הניכוי, כשדולג. לתצוגה בלבד. */
  blockedBy?: string;
}

export interface ParaDeductionStamp {
  status: ParaDeductionStatus;
  detail: string;
}

/** החותמת של תקן שאינו הזנת פרא - אין בו ניכוי ולכן גם אין על מה להישען. */
export const NOT_APPLICABLE_STAMP: ParaDeductionStamp = {
  status: PARA_DEDUCTION_STATUS.notApplicable,
  detail: '',
};

/**
 * פסיקים וסוגריים בשם תקן היו שוברים את הפרסור, ולכן הם מוסרים בכתיבה.
 * השם הוא לתצוגה בלבד, אז אין נזק באיבוד התו.
 */
function sanitizeName(name: string): string {
  return name.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** בונה את שני ערכי החותמת מרשימת ימי העבודה של התקן. */
export function buildParaDeductionStamp(entries: readonly DayDeduction[]): ParaDeductionStamp {
  const working = entries.filter((e) => DAY_LETTER[e.day as (typeof DAYS)[number]] !== undefined);
  if (working.length === 0) return NOT_APPLICABLE_STAMP;

  const detail = working
    .map((e) => {
      const letter = DAY_LETTER[e.day as (typeof DAYS)[number]];
      const who = e.minutes === 0 && e.blockedBy ? ` (${sanitizeName(e.blockedBy)})` : '';
      return `${letter}:${e.minutes}${who}`;
    })
    .join(', ');

  const deducted = working.filter((e) => e.minutes > 0).length;
  const status =
    deducted === working.length
      ? PARA_DEDUCTION_STATUS.deducted
      : deducted === 0
        ? PARA_DEDUCTION_STATUS.skipped
        : PARA_DEDUCTION_STATUS.partial;

  return { status, detail };
}

/**
 * קורא את הפירוט חזרה למפת יום → דקות שנוכו.
 *
 * מחזיר null כשאין מה לקרוא או כשהטקסט אינו בפורמט המוכר. השדה ניתן לעריכה
 * ידנית באיירטייבל, ולכן כישלון פרסור חייב להיות שקוף לקורא: null פירושו
 * "אין מידע", והקורא נופל לגזירה במקום להסיק מסקנה שגויה.
 */
export function parseParaDeductionDetail(detail: string | null | undefined): Map<Day, number> | null {
  if (!detail || !detail.trim()) return null;
  const out = new Map<Day, number>();
  // אות יום בתחילת המחרוזת או אחרי פסיק בלבד, כדי ששם תקן לא ייקרא כיום.
  const token = /(?:^|,\s*)([א-ו]):(\d+)/g;
  for (const m of detail.matchAll(token)) {
    const day = LETTER_DAY.get(m[1]);
    if (!day) return null;
    out.set(day, Number(m[2]));
  }
  return out.size > 0 ? out : null;
}

/**
 * האם התקן ניכה 35/40 ביום נתון, לפי החותמת בלבד.
 *
 * `true` / `false` = החותמת יודעת לענות. `null` = אין חותמת קריאה, והקורא
 * צריך ליפול לגזירה (ראו deriveDeductedOnDay ב-sameInstitutionDays.ts).
 */
export function deductedOnDay(
  stamp: { status?: string | null; detail?: string | null },
  day: Day,
): boolean | null {
  if (stamp.status === PARA_DEDUCTION_STATUS.notApplicable) return false;
  const parsed = parseParaDeductionDetail(stamp.detail);
  if (!parsed) return null;
  const minutes = parsed.get(day);
  if (minutes === undefined) return false; // יום שהתקן אינו עובד בו
  return minutes > 0;
}
