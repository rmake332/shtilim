import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POSITION_FIELDS, SCHEDULE_FIELDS, BUDGET_FIELDS, TABLES } from '../lib/airtable/schema';

vi.mock('server-only', () => ({}));

const listRecords = vi.fn();
vi.mock('../lib/airtable/client', () => ({
  listRecords: (...args: unknown[]) => listRecords(...args),
  escapeFormulaValue: (s: string) => s,
}));

const { findSameInstitutionDays } = await import('../lib/sameInstitutionDays');

const MOSAD_A = 'recInstitutionA';
const MOSAD_B = 'recInstitutionB';

/** שעת יום כ-duration של איירטייבל: שניות מחצות. */
function secs(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}

/** תקן פעיל עם משמרת אחת ביום ראשון, אלא אם צוין אחרת. */
function position(opts: {
  id: string;
  mosadId: string;
  role?: string;
  prevYear?: boolean;
  sun?: [string, string];
  tue?: [string, string];
  /** מזהה שורת תקציב התחלתי, לגזירה כשאין חותמת. */
  roleId?: string;
  /** חותמת ניכוי הפרא, כשהתקן כבר סומן. */
  stamp?: { status: string; detail: string };
}) {
  const fields: Record<string, unknown> = {
    [POSITION_FIELDS.mosadLookup]: [opts.mosadId],
    [POSITION_FIELDS.roleTitleText]: opts.role ?? 'סייעת',
    [POSITION_FIELDS.mosadNameText]: 'שתילים ירושלים',
    ...(opts.prevYear ? { [POSITION_FIELDS.prevYearStatus]: 'כן' } : {}),
    ...(opts.roleId ? { [POSITION_FIELDS.roleLink]: [opts.roleId] } : {}),
    ...(opts.stamp
      ? {
          [POSITION_FIELDS.paraDeduction]: opts.stamp.status,
          [POSITION_FIELDS.paraDeductionDetail]: opts.stamp.detail,
        }
      : {}),
  };
  if (opts.sun) {
    fields[SCHEDULE_FIELDS.sun.in[0]] = secs(opts.sun[0]);
    fields[SCHEDULE_FIELDS.sun.out[0]] = secs(opts.sun[1]);
  }
  if (opts.tue) {
    fields[SCHEDULE_FIELDS.tue.in[0]] = secs(opts.tue[0]);
    fields[SCHEDULE_FIELDS.tue.out[0]] = secs(opts.tue[1]);
  }
  return { id: opts.id, fields };
}

/**
 * השליפה הראשונה היא תקנים פעילים, השנייה (כשנדרשת) היא תקציב התחלתי.
 * `types` ממפה מזהה שורת תקציב לסוג מערכת השעות שלה.
 */
function mockTables(positions: unknown[], types: Record<string, string> = {}) {
  listRecords.mockImplementation(async (table: string) => {
    if (table === TABLES.budget)
      return Object.entries(types).map(([id, scheduleType]) => ({
        id,
        fields: { [BUDGET_FIELDS.scheduleType]: scheduleType },
      }));
    return positions;
  });
}

const params = { tz: '318866779', mosadId: MOSAD_A };

describe('findSameInstitutionDays', () => {
  beforeEach(() => listRecords.mockReset());

  it('returns only the days that carry hours, with the position name and shifts', async () => {
    mockTables([
      position({ id: 'rec1', mosadId: MOSAD_A, sun: ['08:00', '12:00'], tue: ['09:00', '11:30'] }),
    ]);

    const days = await findSameInstitutionDays(params);

    expect(Object.keys(days).sort()).toEqual(['sun', 'tue']);
    expect(days.sun).toEqual([
      {
        positionId: 'rec1',
        positionName: 'סייעת - שתילים ירושלים',
        shifts: ['08:00-12:00'],
        deducted: false,
      },
    ]);
    expect(days.tue?.[0].shifts).toEqual(['09:00-11:30']);
  });

  it('ignores positions at another institution', async () => {
    mockTables([position({ id: 'rec1', mosadId: MOSAD_B, sun: ['08:00', '12:00'] })]);

    expect(await findSameInstitutionDays(params)).toEqual({});
  });

  it('ignores prior-year positions and the position being edited', async () => {
    mockTables([
      position({ id: 'recPrevYear', mosadId: MOSAD_A, sun: ['08:00', '12:00'], prevYear: true }),
      position({ id: 'recEdited', mosadId: MOSAD_A, tue: ['08:00', '12:00'] }),
    ]);

    const days = await findSameInstitutionDays({ ...params, excludePositionId: 'recEdited' });

    expect(days).toEqual({});
  });

  it('lists every position that occupies the same day', async () => {
    mockTables([
      position({ id: 'rec1', mosadId: MOSAD_A, role: 'סייעת', sun: ['08:00', '12:00'] }),
      position({ id: 'rec2', mosadId: MOSAD_A, role: 'מטפלת', sun: ['13:00', '15:00'] }),
    ]);

    const days = await findSameInstitutionDays(params);

    expect(days.sun?.map((p) => p.positionId)).toEqual(['rec1', 'rec2']);
  });

  it('counts a day as occupied even when only one side of the shift is filled', async () => {
    mockTables([
      {
        id: 'rec1',
        fields: {
          [POSITION_FIELDS.mosadLookup]: [MOSAD_A],
          [SCHEDULE_FIELDS.sun.in[0]]: secs('08:00'),
        },
      },
    ]);

    const days = await findSameInstitutionDays(params);

    expect(days.sun).toEqual([
      { positionId: 'rec1', positionName: 'תקן קיים', shifts: [], deducted: false },
    ]);
  });
});

describe('findSameInstitutionDays - האם התקן הקיים באמת ניכה', () => {
  beforeEach(() => listRecords.mockReset());

  it('חותמת "נוכה" ביום המשותף - הניכוי נלקח, ולכן deducted', async () => {
    mockTables([
      position({
        id: 'rec1',
        mosadId: MOSAD_A,
        sun: ['08:00', '13:55'],
        stamp: { status: 'נוכה', detail: 'א:40' },
      }),
    ]);

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(true);
  });

  it('חותמת שמראה שהתקן עצמו דילג באותו יום - לא deducted', async () => {
    // בלי החותמת הגזירה הייתה טועה כאן: זה תקן פרא של יום ארוך, והיא הייתה
    // מסיקה שנוכה בו. זה בדיוק המקרה שבגללו נשמרת חותמת.
    mockTables(
      [
        position({
          id: 'rec1',
          mosadId: MOSAD_A,
          roleId: 'recBudgetPara',
          sun: ['08:00', '13:55'],
          stamp: { status: 'תקן נוסף ללא ניכוי', detail: 'א:0 (פרא רפואי)' },
        }),
      ],
      { recBudgetPara: 'פרא' },
    );

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(false);
  });

  it('חותמת "לא נדרש" - תקן שאינו הזנת פרא לעולם לא ניכה', async () => {
    mockTables([
      position({
        id: 'rec1',
        mosadId: MOSAD_A,
        role: 'הדרכה פרא',
        sun: ['14:00', '14:30'],
        stamp: { status: 'לא נדרש', detail: '' },
      }),
    ]);

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(false);
  });

  it('בלי חותמת, תקן בסוג מערכת "רגיל" אינו מנכה - גם ביום ארוך', async () => {
    mockTables(
      [
        position({
          id: 'rec1',
          mosadId: MOSAD_A,
          role: 'הדרכה פרא',
          roleId: 'recBudgetRegular',
          sun: ['08:00', '14:00'],
        }),
      ],
      { recBudgetRegular: 'רגיל' },
    );

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(false);
  });

  it('בלי חותמת, תקן פרא מתחת ל-80 דקות אינו מנכה', async () => {
    mockTables(
      [
        position({
          id: 'rec1',
          mosadId: MOSAD_A,
          roleId: 'recBudgetPara',
          sun: ['14:00', '15:00'], // 60 דקות
        }),
      ],
      { recBudgetPara: 'פרא' },
    );

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(false);
  });

  it('בלי חותמת, תקן פרא של 80 דקות ומעלה מנכה', async () => {
    mockTables(
      [
        position({
          id: 'rec1',
          mosadId: MOSAD_A,
          roleId: 'recBudgetPara',
          sun: ['08:00', '13:55'],
        }),
      ],
      { recBudgetPara: 'פרא' },
    );

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(true);
  });

  it('"הוראה - לוח פרא" נספר כהזנת פרא גם הוא', async () => {
    mockTables(
      [position({ id: 'rec1', mosadId: MOSAD_A, roleId: 'recB', sun: ['08:00', '13:55'] })],
      { recB: 'הוראה - לוח פרא' },
    );

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(true);
  });

  it('חותמת שנערכה ידנית ואינה קריאה - נופלים לגזירה ולא מנחשים', async () => {
    mockTables(
      [
        position({
          id: 'rec1',
          mosadId: MOSAD_A,
          roleId: 'recBudgetRegular',
          sun: ['08:00', '14:00'],
          stamp: { status: 'נוכה', detail: 'מישהו כתב כאן טקסט חופשי' },
        }),
      ],
      { recBudgetRegular: 'רגיל' },
    );

    expect((await findSameInstitutionDays(params)).sun?.[0].deducted).toBe(false);
  });

  it('כשכל התקנים מסומנים, אין שליפה נוספת מתקציב התחלתי', async () => {
    mockTables([
      position({
        id: 'rec1',
        mosadId: MOSAD_A,
        sun: ['08:00', '13:55'],
        stamp: { status: 'נוכה', detail: 'א:40' },
      }),
    ]);

    await findSameInstitutionDays(params);

    expect(listRecords).toHaveBeenCalledTimes(1);
  });
});
