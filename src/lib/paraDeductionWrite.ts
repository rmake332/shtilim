import 'server-only';
import { getRecord, listRecords } from '@/lib/airtable/client';
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
): Promise<{ name: string; detail: string }[]> {
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
 * תקנים שהיו נשענים על הניכוי של התקן הנערך, ביום שאחרי העריכה כבר אין בו מנכה.
 *
 * הניכוי נלקח פעם אחת ליום. כשעריכה מזיזה יום, מקצרת אותו או מבטלת אותו, התקן
 * שוויתר על הניכוי באותו יום נשאר עם שעות גבוהות מדי, ואין שום טריגר שיחשב
 * אותו מחדש. זו אינה סיבה לחסום את העריכה (הזזת ימים היא פעולה לגיטימית), אבל
 * היא חייבת להיאמר בקול במקום להישאר תקלה שקטה.
 *
 * הקריטריון הוא "אין מנכה ביום הזה" ולא "התקן הנערך אינו מנכה": אם תקן שלישי
 * של אותו עובד מחזיק את הניכוי באותו יום, התלוי עדיין מכוסה ואין מה להתריע.
 */
export function dependentsLosingDeduction(params: {
  /** הימים שבהם מישהו מנכה אחרי השמירה (התקן הנערך או תקן אחר של העובד). */
  coveredDaysAfterEdit: Set<Day>;
  /**
   * התקנים שנשענים על הניכוי של התקן הנערך, עם החותמת שלהם. נקראים לפני
   * הכתיבה, כי הכתיבה עצמה משנה את הקישורים.
   */
  dependents: { name: string; detail: string }[];
}): string[] {
  const out: string[] = [];
  for (const dep of params.dependents) {
    const parsed = parseParaDeductionDetail(dep.detail);
    if (!parsed) continue;
    for (const [day, minutes] of parsed) {
      if (minutes !== 0) continue;
      if (params.coveredDaysAfterEdit.has(day)) continue;
      out.push(
        `התקן "${dep.name}" ויתר על ניכוי 35/40 ביום ${DAY_LABELS[day]} משום שהניכוי נלקח בתקן זה. ` +
          `אחרי העדכון אין יותר מי שמנכה באותו יום, ולכן יש לעדכן את שעותיו של "${dep.name}".`,
      );
    }
  }
  return out;
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
): Promise<{ fields: Record<string, unknown>; coveredDays: Set<Day> }> {
  const { scheduleType, schedule, tz, mosadId, excludePositionId } = params;

  if (!isParaEntry(scheduleType) || !tz) {
    return {
      fields: {
        [POSITION_FIELDS.paraDeduction]: NOT_APPLICABLE_STAMP.status,
        [POSITION_FIELDS.paraDeductionDetail]: '',
        [POSITION_FIELDS.paraDeductionLeansOn]: [],
      },
      coveredDays: new Set(),
    };
  }

  const sameDays = await findSameInstitutionDays({ tz, mosadId, excludePositionId }, requestId);

  const entries: DayDeduction[] = [];
  const leansOn = new Set<string>();
  const serverSkipped = new Set<Day>();
  /**
   * הימים שבהם מישהו מנכה אחרי השמירה: התקן הזה עצמו, או תקן אחר של העובד
   * באותו מוסד. זה ולא "הימים שהתקן הזה מנכה בהם" הוא הקריטריון לאזהרה:
   * ביום שתקן שלישי מחזיק בו את הניכוי, תקן שדילג עדיין מכוסה כראוי.
   */
  const coveredDays = new Set<Day>();
  for (const day of DAYS) {
    if ((sameDays[day] ?? []).some((p) => p.deducted)) coveredDays.add(day);
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
      coveredDays.add(day);
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
    },
    coveredDays,
  };
}
