import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, SCHEDULE_FIELDS } from '@/lib/airtable/schema';
import { REGULAR_DAYS, durationToHHMM, type Day } from '@/lib/schedule/time';

/**
 * הימים שבהם העובד כבר מועסק באותו מוסד בתקן אחר.
 *
 * משמש את הזנת מערכת השעות בסגנון פרא: ביום שמופיע כאן מדלגים על ניכוי
 * ה-35/40 הרגיל של נוסחת הפרא (paraDayHours), כי הוא כבר נוכה בתקן הקיים.
 * המוסד נגזר מהטוקן בצד השרת ולעולם לא מתקבל מהלקוח.
 */

export interface SameDayPosition {
  positionId: string;
  /** שם התפקיד + שם המוסד, לתצוגה בהערה למשתמש. */
  positionName: string;
  /** משמרות אותו יום בתקן הקיים ("HH:MM-HH:MM"), לתצוגה בלבד. */
  shifts: string[];
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

  const days: SameInstitutionDays = {};

  for (const rec of records) {
    if (params.excludePositionId && rec.id === params.excludePositionId) continue;
    if (text(rec.fields[POSITION_FIELDS.prevYearStatus]) === 'כן') continue;
    // המוסד נשמר בלוקאפ כמזהי רשומות של טבלת מוסדות - השוואה מדויקת, בלי שמות.
    if (!recordIds(rec.fields[POSITION_FIELDS.mosadLookup]).includes(params.mosadId)) continue;

    const roleTitle = text(rec.fields[POSITION_FIELDS.roleTitleText]);
    const mosadName = text(rec.fields[POSITION_FIELDS.mosadNameText]);
    const positionName = [roleTitle, mosadName].filter(Boolean).join(' - ') || 'תקן קיים';

    for (const day of REGULAR_DAYS) {
      const dayFields = SCHEDULE_FIELDS[day];
      const shifts: string[] = [];
      let worksThisDay = false;
      for (let i = 0; i < dayFields.in.length; i++) {
        const inn = shiftTime(rec.fields[dayFields.in[i]]);
        const out = shiftTime(rec.fields[dayFields.out[i]]);
        if (!inn && !out) continue;
        worksThisDay = true;
        if (inn && out) shifts.push(`${inn}-${out}`);
      }
      if (!worksThisDay) continue;
      (days[day] ??= []).push({ positionId: rec.id, positionName, shifts });
    }
  }

  return days;
}
