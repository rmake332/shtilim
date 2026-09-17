import 'server-only';
import { POSITION_FIELDS } from '@/lib/airtable/schema';
import { DAYS, toMinutes, PARA_MIN_DAY_MINUTES, type Day } from '@/lib/schedule/time';
import { isParaEntry } from '@/lib/schedule/ofek';
import {
  buildParaDeductionStamp,
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
): Promise<Record<string, unknown>> {
  const { scheduleType, schedule, tz, mosadId, excludePositionId } = params;

  if (!isParaEntry(scheduleType) || !tz) {
    return {
      [POSITION_FIELDS.paraDeduction]: NOT_APPLICABLE_STAMP.status,
      [POSITION_FIELDS.paraDeductionDetail]: '',
      [POSITION_FIELDS.paraDeductionLeansOn]: [],
    };
  }

  const sameDays = await findSameInstitutionDays({ tz, mosadId, excludePositionId }, requestId);

  const entries: DayDeduction[] = [];
  const leansOn = new Set<string>();
  const serverSkipped = new Set<Day>();

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
    [POSITION_FIELDS.paraDeduction]: stamp.status,
    [POSITION_FIELDS.paraDeductionDetail]: stamp.detail,
    [POSITION_FIELDS.paraDeductionLeansOn]: [...leansOn],
  };
}
