import 'server-only';
import { getRecord, listRecords, updateRecord } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS } from '@/lib/airtable/schema';
import { DAYS, DAY_LABELS, toMinutes, PARA_MIN_DAY_MINUTES, type Day } from '@/lib/schedule/time';
import { isParaEntry } from '@/lib/schedule/ofek';
import {
  buildParaDeductionStamp,
  parseParaDeductionDetail,
  NOT_APPLICABLE_STAMP,
  type DayDeduction,
} from '@/lib/schedule/paraDeductionStamp';
import { findSameInstitutionDays } from '@/lib/sameInstitutionDays';
import { logger } from '@/lib/logger';
import type { ScheduleData } from '@/lib/formTypes';

/**
 * כתיבת חותמת ניכוי הפרא בשמירת תקן.
 *
 * החישוב נעשה כאן ולא מתקבל מהלקוח: המוסד נגזר מהטוקן, והחותמת צריכה לתאר את
 * מצב הבסיס ברגע הכתיבה. יחד עם זאת השעות עצמן חושבו אצל הלקוח, ולכן אם המצב
 * במוסד השתנה בין מילוי הטופס לשמירתו (נוצר או נמחק תקן באותו יום), החותמת
 * הייתה מתעדת מצב אחד והשעות משקפות אחר. במקרה כזה עדיף להיכשל בקול ולבקש
 * חישוב מחדש, מאשר לשמור רשומה שמתעדת שקר.
 */

/** מציין בטבלת הכיסוי שהתקן הנערך עצמו מנכה באותו יום; מוחלף במזהה שלו בשרת. */
export const SELF = '__self__';

/** יום → מזהה התקן שמנכה בו אחרי השמירה (או SELF). יום שאינו במפה: אין מנכה. */
export type DeductionCoverage = Map<Day, string>;

/** תקן שנשען על הניכוי של התקן הנערך, כפי שהוא לפני הכתיבה. */
export interface Dependent {
  id: string;
  /** שם העובד + התפקיד + המוסד, לתצוגה בהודעות. */
  name: string;
  detail: string;
}

/** מה צריך להשתנות ברשומה של תקן תלוי בעקבות העריכה. */
export interface DependentUpdate {
  id: string;
  name: string;
  /** הימים שנשארו בלי מנכה. ריק = התלות עברה לתקן אחר והכל תקין. */
  orphanDays: Day[];
  /** הקישור המעודכן: מי מחזיק עכשיו את הניכוי בימים שהתקן ויתר בהם. */
  leansOn: string[];
  /** הטקסט שנכתב לשדה "סיבת דרישת עדכון ניכוי", ריק כשאין דרישה. */
  reason: string;
  /** ההודעה למי שביצע את העריכה, ריקה כשאין מה לומר. */
  warning: string;
}

/**
 * כל שמירה של תקן מנקה את הסימון שלו עצמו: החותמת שלו מחושבת עכשיו מחדש מול
 * מצב הבסיס, ולכן היא נכונה בהגדרה ואין יותר מה לתקן בו.
 */
const CLEAR_NEEDS_UPDATE = {
  [POSITION_FIELDS.paraDeductionNeedsUpdate]: false,
  [POSITION_FIELDS.paraDeductionNeedsUpdateReason]: null,
} as const;

/** נזרקת כשמפת הדילוג של הלקוח אינה תואמת את זו שהשרת חישב בזמן השמירה. */
export class ParaDeductionMismatchError extends Error {
  constructor() {
    super(
      'תקניו של העובד במוסד השתנו בזמן מילוי הטופס, ולכן שעות הפרא שחושבו כבר אינן נכונות. ' +
        'יש לרענן את הדף ולהזין את מערכת השעות מחדש.',
    );
    this.name = 'ParaDeductionMismatchError';
  }
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>).name);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(',');
  return String(v);
}

function recordIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x : (x as { id?: string } | null)?.id))
    .filter((x): x is string => Boolean(x));
}

/**
 * התקנים שנשענים כרגע על הניכוי של `positionId`, לפי השדה ההפוך שאיירטייבל
 * מתחזק. נקרא לפני הכתיבה, כי הכתיבה עצמה משנה את הקישורים.
 */
export async function leanedOnByDependents(
  positionId: string,
  requestId?: string,
): Promise<Dependent[]> {
  const rec = await getRecord(TABLES.activePositions, positionId, requestId);
  const ids = recordIds(rec?.fields[POSITION_FIELDS.paraDeductionLeanedOnBy]);
  if (ids.length === 0) return [];

  const rows = await listRecords(
    TABLES.activePositions,
    {
      filterByFormula: `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      fields: [
        POSITION_FIELDS.roleTitleText,
        POSITION_FIELDS.mosadNameText,
        POSITION_FIELDS.employeeNameText,
        POSITION_FIELDS.paraDeductionDetail,
      ],
    },
    requestId,
  );
  return rows.map((r) => ({
    id: r.id,
    name:
      [
        text(r.fields[POSITION_FIELDS.employeeNameText]),
        text(r.fields[POSITION_FIELDS.roleTitleText]),
        text(r.fields[POSITION_FIELDS.mosadNameText]),
      ]
        .filter(Boolean)
        .join(' - ') || 'תקן אחר',
    detail: text(r.fields[POSITION_FIELDS.paraDeductionDetail]),
  }));
}

/**
 * מה לעשות עם כל תקן שנשען על הניכוי של התקן הנערך, אחרי שהעריכה שינתה את
 * מערכת השעות שלו.
 *
 * הניכוי נלקח פעם אחת ליום. עריכה שמזיזה יום, מקצרת אותו או מבטלת אותו יכולה
 * להשאיר את מי שוויתר על הניכוי באותו יום עם שעות גבוהות מדי, ואין שום טריגר
 * שיחשב אותו מחדש. שני מצבים אפשריים לכל יום:
 *
 *  - **תקן אחר לקח את הניכוי** (למשל תקן שלישי של אותו עובד): התלוי מכוסה,
 *    ורק הקישור שלו מופנה למי שמחזיק עכשיו. בלי זה הקישור היה נשאר מצביע על
 *    מי שכבר אינו מנכה, ומייצר התראת שווא בהסרה.
 *  - **אף אחד לא לוקח**: התלוי מסומן באיירטייבל כדורש עדכון, ומי שערך מקבל
 *    הודעה. העריכה עצמה אינה נחסמת, כי הזזת ימים היא פעולה לגיטימית.
 *
 * Pure - הכתיבה עצמה ב-applyDependentUpdates.
 */
export function planDependentUpdates(params: {
  /** מי מנכה בכל יום אחרי השמירה. SELF הוחלף כבר במזהה התקן הנערך. */
  coverage: DeductionCoverage;
  /** התקנים שנשענו על הניכוי של התקן הנערך, כפי שהם לפני הכתיבה. */
  dependents: readonly Dependent[];
}): DependentUpdate[] {
  const out: DependentUpdate[] = [];

  for (const dep of params.dependents) {
    const parsed = parseParaDeductionDetail(dep.detail);
    // חותמת שאינה נפרסת (שדה טקסט שניתן לעריכה ידנית): אי אפשר לדעת באילו ימים
    // התקן ויתר על הניכוי, ולכן אי אפשר להכריע אם הוא נשאר מכוסה. דילוג שקט היה
    // מוציא אותו משתי רשתות הביטחון גם יחד - גם מהסימון וגם מהביקורת, שאף היא
    // נשענת על החותמת. לכן הוא מסומן לבדיקה ידנית.
    if (!parsed) {
      out.push({
        id: dep.id,
        name: dep.name,
        // אין ימים ידועים, אבל כן יש דרישת עדכון: orphanDays ריק לא יספיק כאן,
        // ולכן הסימון נגזר מ-reason ולא מאורך המערך (ראה applyDependentUpdates).
        orphanDays: [],
        leansOn: [],
        reason:
          'לא ניתן לקרוא את שדה "פירוט ניכוי פרא" של התקן, ולכן לא ניתן לדעת באילו ימים ' +
          'ויתר על ניכוי 35/40. התקן שממנו נלקח הניכוי שונה או נמחק. יש לפתוח את התקן ' +
          'לעריכה ולשמור אותו מחדש כדי שהשעות והחותמת יחושבו נכון.',
        warning:
          `לתקן "${dep.name}" יש חותמת ניכוי פרא שאינה קריאה, ולכן לא ניתן לבדוק אם הוא ` +
          `נשאר ללא ניכוי. התקן סומן באיירטייבל כדורש עדכון.`,
      });
      continue;
    }

    /** מי מחזיק עכשיו את הניכוי בכל יום שהתקן התלוי ויתר בו. */
    const holders = new Set<string>();
    const orphanDays: Day[] = [];
    for (const [day, minutes] of parsed) {
      if (minutes !== 0) continue; // יום שהתקן ניכה בו בעצמו אינו תלוי באיש
      const holder = params.coverage.get(day);
      if (holder) holders.add(holder);
      else orphanDays.push(day);
    }

    const days = orphanDays.map((d) => DAY_LABELS[d]).join(', ');
    const reason = orphanDays.length
      ? `התקן ויתר על ניכוי 35/40 ביום ${days} משום שהניכוי נלקח בתקן אחר של העובד באותו מוסד. ` +
        `אותו תקן שונה או נמחק, ואיש כבר אינו מנכה באותו יום. השעות כאן גבוהות מדי - ` +
        `יש לפתוח את התקן לעריכה ולשמור אותו מחדש כדי שהשעות יחושבו נכון.`
      : '';

    out.push({
      id: dep.id,
      name: dep.name,
      orphanDays,
      leansOn: [...holders],
      reason,
      // ההודעה למי שערך: אותה עובדה, בניסוח של מי שגרם לה זה עתה.
      warning: orphanDays.length
        ? `התקן "${dep.name}" ויתר על ניכוי 35/40 ביום ${days} משום שהניכוי נלקח בתקן זה. ` +
          `אחרי העדכון אין יותר מי שמנכה באותו יום, ולכן יש לעדכן את שעותיו של "${dep.name}". ` +
          `התקן סומן באיירטייבל כדורש עדכון.`
        : '',
    });
  }

  return out;
}

/**
 * כתיבת התוצאה לרשומות התלויות: קישור מעודכן, וסימון למי שנשאר בלי מנכה.
 *
 * **השעות של התקן התלוי אינן משתנות כאן בכוונה.** שינוי שעות משנה ניצול תקציב,
 * ועלול להפיל את התקן על צירוף שאינו קיים במחשבון או להוציא אותו מהתקציב. עדיף
 * תור גלוי שאדם מאשר מאשר תיקון שקט שאיש לא ראה.
 */
export async function applyDependentUpdates(
  updates: readonly DependentUpdate[],
  requestId?: string,
): Promise<void> {
  for (const u of updates) {
    await updateRecord(
      TABLES.activePositions,
      u.id,
      {
        [POSITION_FIELDS.paraDeductionLeansOn]: u.leansOn,
        // `reason` ולא `orphanDays.length`: חותמת שאינה קריאה מייצרת דרישת עדכון
        // בלי ימים ידועים.
        [POSITION_FIELDS.paraDeductionNeedsUpdate]: Boolean(u.reason),
        [POSITION_FIELDS.paraDeductionNeedsUpdateReason]: u.reason || null,
      },
      requestId,
    );
  }
}

/** סך דקות העבודה ביום, ממערכת השעות של הטופס. */
function dayMinutes(schedule: ScheduleData, day: Day): number {
  return (schedule.week?.[day] ?? []).reduce((sum, s) => {
    const a = toMinutes(s.in);
    const b = toMinutes(s.out);
    return a != null && b != null && b > a ? sum + (b - a) : sum;
  }, 0);
}

/**
 * שדות החותמת לכתיבה לאיירטייבל. תקן שאינו הזנת פרא מקבל "לא נדרש" ומנקה את
 * שאר השדות, כדי שעריכה שמשנה סוג מערכת שעות לא תשאיר חותמת ישנה תלויה באוויר.
 */
export async function paraDeductionFields(
  params: {
    scheduleType: string | null | undefined;
    schedule: ScheduleData;
    tz: string;
    mosadId: string;
    /** התקן הנערך, כדי שלא ייחשב כתקן אחר של עצמו. */
    excludePositionId?: string;
  },
  requestId?: string,
): Promise<{ fields: Record<string, unknown>; coverage: DeductionCoverage }> {
  const { scheduleType, schedule, tz, mosadId, excludePositionId } = params;

  if (!isParaEntry(scheduleType) || !tz) {
    return {
      fields: {
        [POSITION_FIELDS.paraDeduction]: NOT_APPLICABLE_STAMP.status,
        [POSITION_FIELDS.paraDeductionDetail]: '',
        [POSITION_FIELDS.paraDeductionLeansOn]: [],
        ...CLEAR_NEEDS_UPDATE,
      },
      coverage: new Map(),
    };
  }

  const sameDays = await findSameInstitutionDays({ tz, mosadId, excludePositionId }, requestId);

  const entries: DayDeduction[] = [];
  const leansOn = new Set<string>();
  const serverSkipped = new Set<Day>();
  /**
   * מי מנכה בכל יום אחרי השמירה: התקן הזה עצמו (SELF) או תקן אחר של העובד
   * באותו מוסד. זה ולא "הימים שהתקן הזה מנכה בהם" הוא הקריטריון: ביום שתקן
   * שלישי מחזיק בו את הניכוי, תקן שדילג עדיין מכוסה כראוי.
   */
  const coverage: DeductionCoverage = new Map();
  for (const day of DAYS) {
    const peer = (sameDays[day] ?? []).find((p) => p.deducted);
    if (peer) coverage.set(day, peer.positionId);
  }

  for (const day of DAYS) {
    const minutes = dayMinutes(schedule, day);
    // ימים מתחת לסף שנוסחת הפרא בכלל לא רצה עליהם אינם נכנסים לחותמת: לא נוכה
    // בהם דבר, וגם אין להם מה להציע לתקן אחר.
    if (minutes < PARA_MIN_DAY_MINUTES) continue;

    const holder = (sameDays[day] ?? []).find((p) => p.deducted);
    if (holder) {
      serverSkipped.add(day);
      leansOn.add(holder.positionId);
      entries.push({ day, minutes: 0, blockedBy: holder.positionName });
    } else {
      entries.push({ day, minutes: minutes < 100 ? 35 : 40 });
      coverage.set(day, SELF);
    }
  }

  const clientSkipped = new Set((schedule.skippedDeductionDays ?? []) as Day[]);
  const sameSet =
    clientSkipped.size === serverSkipped.size && [...serverSkipped].every((d) => clientSkipped.has(d));
  if (!sameSet) {
    logger.warn(
      {
        requestId,
        client: [...clientSkipped],
        server: [...serverSkipped],
      },
      'para deduction skip map changed between form fill and save',
    );
    throw new ParaDeductionMismatchError();
  }

  const stamp = buildParaDeductionStamp(entries);
  return {
    fields: {
      [POSITION_FIELDS.paraDeduction]: stamp.status,
      [POSITION_FIELDS.paraDeductionDetail]: stamp.detail,
      [POSITION_FIELDS.paraDeductionLeansOn]: [...leansOn],
      ...CLEAR_NEEDS_UPDATE,
    },
    coverage,
  };
}
