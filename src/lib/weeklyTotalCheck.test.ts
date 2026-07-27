import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POSITION_FIELDS, EMPLOYEE_FIELDS, TABLES } from '../lib/airtable/schema';

vi.mock('server-only', () => ({}));

const listRecords = vi.fn();
vi.mock('../lib/airtable/client', () => ({
  listRecords: (...args: unknown[]) => listRecords(...args),
  escapeFormulaValue: (s: string) => s,
}));

const { checkWeeklyTotal } = await import('../lib/weeklyTotalCheck');

const TZ = '318866779';

/** An active position with the fields the cap check reads. */
function position(opts: { id: string; hours: number; layer?: string; prevYear?: boolean }) {
  return {
    id: opts.id,
    fields: {
      [POSITION_FIELDS.weeklyHours]: opts.hours,
      [POSITION_FIELDS.layer]: opts.layer ?? 'יסודי',
      [POSITION_FIELDS.roleTitleText]: ['סייעת'],
      [POSITION_FIELDS.mosadNameText]: ['שתילים ירושלים'],
      ...(opts.prevYear ? { [POSITION_FIELDS.prevYearStatus]: 'כן' } : {}),
    },
  };
}

/**
 * The check issues two lookups in parallel: תקנים פעילים and רשימת עובדים.
 * Route each by table id so order doesn't matter.
 */
function mockTables(positions: unknown[], twelveHour = false) {
  listRecords.mockImplementation(async (tableId: string) => {
    if (tableId === TABLES.activePositions) return positions;
    if (tableId === TABLES.employees)
      return [{ id: 'recEmp', fields: { [EMPLOYEE_FIELDS.twelveHourEmployment]: twelveHour } }];
    return [];
  });
}

describe('checkWeeklyTotal', () => {
  beforeEach(() => listRecords.mockReset());

  it('מתחת לתקרה - עובר', async () => {
    mockTables([position({ id: 'rec1', hours: 20 })]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 15, layer: 'יסודי' });
    expect(r.ok).toBe(true);
    expect(r.existingHours).toBe(20);
    expect(r.total).toBe(35);
    expect(r.message).toBeNull();
  });

  it('בדיוק 42 - עובר', async () => {
    mockTables([position({ id: 'rec1', hours: 20 })]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 22, layer: 'יסודי' });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(42);
  });

  it('מעל 42 בסכום כל התקנים - נחסם', async () => {
    mockTables([position({ id: 'rec1', hours: 20 }), position({ id: 'rec2', hours: 10 })]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 15, layer: 'יסודי' });
    expect(r.ok).toBe(false);
    expect(r.existingHours).toBe(30);
    expect(r.total).toBe(45);
    expect(r.message).toContain('42');
  });

  it('תקן שנה קודמת אינו נספר', async () => {
    mockTables([
      position({ id: 'rec1', hours: 20 }),
      position({ id: 'recPrevYear', hours: 30, prevYear: true }),
    ]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 15, layer: 'יסודי' });
    expect(r.ok).toBe(true);
    expect(r.existingHours).toBe(20);
  });

  it('התקן הנערך אינו נספר פעמיים', async () => {
    mockTables([position({ id: 'rec1', hours: 20 }), position({ id: 'recEdited', hours: 30 })]);
    const r = await checkWeeklyTotal({
      tz: TZ,
      newHours: 15,
      layer: 'יסודי',
      excludePositionId: 'recEdited',
    });
    expect(r.ok).toBe(true);
    expect(r.existingHours).toBe(20);
  });

  it('"העסקה 12 שעות" על העובד - פטור מהתקרה', async () => {
    mockTables([position({ id: 'rec1', hours: 40 })], true);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 20, layer: 'יסודי' });
    expect(r.exempt).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('שכבת התקן הנוכחי פנימיה - פטור מהתקרה', async () => {
    mockTables([position({ id: 'rec1', hours: 40 })]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 20, layer: 'פנימיה' });
    expect(r.exempt).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('תקן קיים בפנימיה - פטור מהתקרה', async () => {
    mockTables([position({ id: 'rec1', hours: 40, layer: 'פנימיה' })]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 20, layer: 'יסודי' });
    expect(r.exempt).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('עובד חדש ללא תקנים - נבדק מול שעות התקן בלבד', async () => {
    mockTables([]);
    expect((await checkWeeklyTotal({ tz: TZ, newHours: 40, layer: 'יסודי' })).ok).toBe(true);
    expect((await checkWeeklyTotal({ tz: TZ, newHours: 43, layer: 'יסודי' })).ok).toBe(false);
  });

  it('תקן ללא שעות אינו מוצג ברשימה', async () => {
    mockTables([position({ id: 'rec1', hours: 20 }), position({ id: 'rec2', hours: 0 })]);
    const r = await checkWeeklyTotal({ tz: TZ, newHours: 15, layer: 'יסודי' });
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0]).toEqual({ id: 'rec1', name: 'סייעת - שתילים ירושלים', hours: 20 });
  });
});
