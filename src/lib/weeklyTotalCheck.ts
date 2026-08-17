import 'server-only';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, EMPLOYEE_FIELDS } from '@/lib/airtable/schema';
import { buildTzExactMatchFormula } from '@/lib/airtable/tzMatch';
import {
  COMBINED_WEEKLY_CAP_HOURS,
  combinedCapError,
  isCombinedCapExempt,
  positionsInAssociation,
  sumPositionHours,
  type PositionHours,
} from '@/lib/schedule/weeklyTotal';

/**
 * בדיקת תקרת 42 השעות השבועיות לעובד - סה"כ תקניו לפי ת.ז., בעמותה של המוסד הנוכחי.
 * משמשת גם את ה-API של שלב מערכת השעות (חסימה מוקדמת בטופס) וגם את השמירה
 * עצמה (submit / עריכת תקן), כדי שלא ניתן יהיה לעקוף אותה.
 *
 * העמותה מגיעה תמיד מה-gate (המוסד שנגזר מהטוקן) ולעולם לא מהלקוח.
 */

export interface WeeklyTotalResult {
  ok: boolean;
  /** פנימייה או "העסקה 12 שעות" - התקרה לא חלה. */
  exempt: boolean;
  cap: number;
  newHours: number;
  existingHours: number;
  total: number;
  /** העמותה שלפיה סוננו התקנים, לתצוגה בטופס. */
  association: string;
  /** התקנים הקיימים שנספרו, לתצוגה בטופס. */
  positions: { id: string; name: string; hours: number }[];
  /** נוסח החריגה בעברית, או null כשהבדיקה עברה. */
  message: string | null;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return num(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>).name);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(',');
  return String(v);
}

/**
 * דגל "העסקה 12 שעות" לפי ת.ז. - false כשהעובד עדיין לא קיים ברשימת עובדים.
 * התאמה מדויקת (ולא FIND) כדי שת.ז. אחת לא תיקח את הדגל של עובד אחר שמכיל אותה.
 */
async function twelveHourEmploymentByTz(tz: string, requestId?: string): Promise<boolean> {
  const formula = buildTzExactMatchFormula(tz, EMPLOYEE_FIELDS.tz);
  if (!formula) return false;
  const records = await listRecords(
    TABLES.employees,
    { filterByFormula: formula, maxRecords: 1, fields: [EMPLOYEE_FIELDS.twelveHourEmployment] },
    requestId,
  );
  return Boolean(records[0]?.fields[EMPLOYEE_FIELDS.twelveHourEmployment]);
}

/**
 * סכום השעות השבועיות של תקני העובד + שעות התקן הנוכחי, מול תקרת ה-42.
 * נספרים רק תקנים במוסדות של `association` (עמותת המוסד הנוכחי). תקני שנה
 * קודמת (prevYearStatus = "כן") אינם נספרים, וכך גם התקן הנערך עצמו
 * (`excludePositionId`) כדי שלא ייספר פעמיים.
 */
export async function checkWeeklyTotal(
  params: {
    tz: string;
    newHours: number;
    layer: string;
    /** עמותת המוסד הנוכחי - מה-gate בלבד. ריקה = אין תקנים בהיקף הבדיקה. */
    association: string;
    excludePositionId?: string;
  },
  requestId?: string,
): Promise<WeeklyTotalResult> {
  const newHours = Number.isFinite(params.newHours) ? params.newHours : 0;
  const association = params.association ?? '';

  const [records, twelveHourEmployment] = await Promise.all([
    listRecords(
      TABLES.activePositions,
      {
        filterByFormula: `FIND("${escapeFormulaValue(params.tz)}", {${POSITION_FIELDS.tzLookup}})`,
        maxRecords: 50,
      },
      requestId,
    ),
    twelveHourEmploymentByTz(params.tz, requestId),
  ]);

  const all: PositionHours[] = [];
  for (const rec of records) {
    if (params.excludePositionId && rec.id === params.excludePositionId) continue;
    if (text(rec.fields[POSITION_FIELDS.prevYearStatus]) === 'כן') continue;
    const roleTitle = text(rec.fields[POSITION_FIELDS.roleTitleText]);
    const mosadName = text(rec.fields[POSITION_FIELDS.mosadNameText]);
    all.push({
      id: rec.id,
      name: [roleTitle, mosadName].filter(Boolean).join(' - ') || 'תקן קיים',
      hours: num(rec.fields[POSITION_FIELDS.weeklyHours]),
      layer: text(rec.fields[POSITION_FIELDS.layer]),
      association: text(rec.fields[POSITION_FIELDS.association]),
    });
  }
  // עמותה = המעסיק לעניין התקרה. תקנים בעמותה אחרת אינם נספרים ואינם משפיעים על הפטור.
  const positions = positionsInAssociation(all, association);

  const exempt = isCombinedCapExempt({ layer: params.layer, twelveHourEmployment, positions });
  const existingHours = sumPositionHours(positions);
  const message = combinedCapError({ newHours, positions, exempt });

  return {
    ok: message === null,
    exempt,
    cap: COMBINED_WEEKLY_CAP_HOURS,
    newHours,
    existingHours,
    total: existingHours + newHours,
    association,
    // רק תקנים שיש בהם שעות בפועל מוצגים - תקן בלי שעות אינו מוסיף מידע.
    positions: positions.filter((p) => p.hours > 0).map(({ id, name, hours }) => ({ id, name, hours })),
    message,
  };
}
