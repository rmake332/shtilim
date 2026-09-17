import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, BUDGET_FIELDS, SCHEDULE_FIELDS } from '@/lib/airtable/schema';
import {
  REGULAR_DAYS,
  DAYS,
  durationToHHMM,
  toMinutes,
  PARA_MIN_DAY_MINUTES,
  type Day,
} from '@/lib/schedule/time';
import { isParaEntry } from '@/lib/schedule/ofek';
import { deductedOnDay } from '@/lib/schedule/paraDeductionStamp';

/**
 * הימים שבהם העובד כבר מועסק באותו מוסד בתקן אחר **שנוכו בו 35/40**.
 *
 * משמש את הזנת מערכת השעות בסגנון פרא: ביום כזה מדלגים על הניכוי בתקן הנוכחי,
 * כי הוא כבר נלקח בתקן הקיים. התנאי הוא ניכוי בפועל ולא עצם קיומו של תקן אחר:
 * תקן בסוג מערכת "רגיל", או יום פרא מתחת ל-80 דקות, מעולם לא ניכה דבר, ודילוג
 * בגללו מנפח את השעות בלי שאיש הפחית אותן.
 *
 * מקור הידע הוא החותמת שנשמרה על התקן הקיים (ראו paraDeductionStamp.ts).
 * לתקנים ישנים שאין להם חותמת יש גזירה כגיבוי, לפי סוג מערכת השעות ודקות היום.
 *
 * המוסד נגזר מהטוקן בצד השרת ולעולם לא מתקבל מהלקוח.
 */

export interface SameDayPosition {
  positionId: string;
  /** שם התפקיד + שם המוסד, לתצוגה בהערה למשתמש. */
  positionName: string;
  /** משמרות אותו יום בתקן הקיים ("HH:MM-HH:MM"), לתצוגה בלבד. */
  shifts: string[];
  /**
   * האם נוכו בתקן הזה 35/40 באותו יום. רק `true` מצדיק דילוג בתקן הנוכחי;
   * `false` אומר שהתקן חולק את היום אך לא הפחית דבר, וזה מידע להצגה בלבד.
   */
  deducted: boolean;
}

export type SameInstitutionDays = Partial<Record<Day, SameDayPosition[]>>;

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

/** שדה שעה בתקן קיים: duration (שניות מחצות) או כבר "HH:MM". */
function shiftTime(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return shiftTime(v[0]);
  return durationToHHMM(v);
}

/** תקן מועמד אחרי פענוח, לפני ההכרעה אם ניכה בכל יום. */
interface Candidate {
  id: string;
  name: string;
  roleId: string;
  stamp: { status: string; detail: string };
  /** יום → { משמרות לתצוגה, סך דקות } עבור הימים שיש בהם שעות. */
  days: Map<Day, { shifts: string[]; minutes: number }>;
}

/**
 * גזירה כגיבוי לתקן בלי חותמת: ניכוי התרחש רק בהזנת פרא וביום של 80 דקות ומעלה,
 * שהוא הסף שמתחתיו נוסחת הפרא בכלל לא רצה (ראו paraDayHours).
 *
 * לגזירה יש נקודה עיוורת ידועה: תקן פרא שבעצמו דילג על הניכוי ייראה לה כמי
 * שניכה. לכן היא גיבוי בלבד, והחותמת גוברת עליה תמיד.
 */
function deriveDeducted(scheduleType: string, dayMinutes: number): boolean {
  return isParaEntry(scheduleType) && dayMinutes >= PARA_MIN_DAY_MINUTES;
}

/** סוג מערכת השעות של התקנים המועמדים, בשליפה אחת מטבלת תקציב התחלתי. */
async function scheduleTypesFor(roleIds: string[], requestId?: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(roleIds.filter(Boolean))];
  if (unique.length === 0) return out;

  const rows = await listRecords(
    TABLES.budget,
    {
      filterByFormula: `OR(${unique.map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      fields: [BUDGET_FIELDS.scheduleType],
    },
    requestId,
  );
  for (const r of rows) out.set(r.id, text(r.fields[BUDGET_FIELDS.scheduleType]));
  return out;
}

/**
 * איתור הימים שבהם לעובד (לפי ת.ז.) כבר יש תקן פעיל אחר באותו מוסד.
 * תקני שנה קודמת (prevYearStatus = "כן") אינם נחשבים, וכך גם התקן הנערך עצמו
 * (`excludePositionId`). יום נחשב תפוס אם יש בו ולו שעת כניסה/יציאה אחת.
 */
export async function findSameInstitutionDays(
  params: { tz: string; mosadId: string; excludePositionId?: string },
  requestId?: string,
): Promise<SameInstitutionDays> {
  const records = await listRecords(
    TABLES.activePositions,
    {
      filterByFormula: `FIND("${escapeFormulaValue(params.tz)}", {${POSITION_FIELDS.tzLookup}})`,
      maxRecords: 50,
    },
    requestId,
  );

  const candidates: Candidate[] = [];

  for (const rec of records) {
    if (params.excludePositionId && rec.id === params.excludePositionId) continue;
    if (text(rec.fields[POSITION_FIELDS.prevYearStatus]) === 'כן') continue;
    // המוסד נשמר בלוקאפ כמזהי רשומות של טבלת מוסדות - השוואה מדויקת, בלי שמות.
    if (!recordIds(rec.fields[POSITION_FIELDS.mosadLookup]).includes(params.mosadId)) continue;

    const roleTitle = text(rec.fields[POSITION_FIELDS.roleTitleText]);
    const mosadName = text(rec.fields[POSITION_FIELDS.mosadNameText]);
    const name = [roleTitle, mosadName].filter(Boolean).join(' - ') || 'תקן קיים';

    const days = new Map<Day, { shifts: string[]; minutes: number }>();
    for (const day of REGULAR_DAYS) {
      const dayFields = SCHEDULE_FIELDS[day];
      const shifts: string[] = [];
      let worksThisDay = false;
      let minutes = 0;
      for (let i = 0; i < dayFields.in.length; i++) {
        const inn = shiftTime(rec.fields[dayFields.in[i]]);
        const out = shiftTime(rec.fields[dayFields.out[i]]);
        if (!inn && !out) continue;
        worksThisDay = true;
        if (inn && out) {
          shifts.push(`${inn}-${out}`);
          const a = toMinutes(inn);
          const b = toMinutes(out);
          if (a != null && b != null && b > a) minutes += b - a;
        }
      }
      if (!worksThisDay) continue;
      days.set(day, { shifts, minutes });
    }
    if (days.size === 0) continue;

    candidates.push({
      id: rec.id,
      name,
      roleId: recordIds(rec.fields[POSITION_FIELDS.roleLink])[0] ?? '',
      stamp: {
        status: text(rec.fields[POSITION_FIELDS.paraDeduction]),
        detail: text(rec.fields[POSITION_FIELDS.paraDeductionDetail]),
      },
      days,
    });
  }

  // סוג מערכת השעות נדרש רק לתקנים שהחותמת שלהם אינה עונה. אחרי ה-backfill זו
  // אמורה להיות קבוצה ריקה, ואז השליפה הנוספת לא יוצאת לדרך כלל.
  const needDerivation = candidates.filter((c) =>
    // מוצ"ש אינו רלוונטי לפרא, אבל די ביום אחד בלי תשובה כדי שנצטרך את הסוג.
    [...c.days.keys()].some((d) => DAYS.includes(d as (typeof DAYS)[number]) && deductedOnDay(c.stamp, d) === null),
  );
  const scheduleTypes = await scheduleTypesFor(
    needDerivation.map((c) => c.roleId),
    requestId,
  );

  const days: SameInstitutionDays = {};
  for (const c of candidates) {
    for (const [day, info] of c.days) {
      const fromStamp = deductedOnDay(c.stamp, day);
      const deducted =
        fromStamp !== null
          ? fromStamp
          : deriveDeducted(scheduleTypes.get(c.roleId) ?? '', info.minutes);
      (days[day] ??= []).push({
        positionId: c.id,
        positionName: c.name,
        shifts: info.shifts,
        deducted,
      });
    }
  }

  return days;
}
