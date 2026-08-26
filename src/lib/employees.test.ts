import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POSITION_FIELDS } from '../lib/airtable/schema';

vi.mock('server-only', () => ({}));

const listRecords = vi.fn();
vi.mock('../lib/airtable/client', () => ({
  listRecords: (...args: unknown[]) => listRecords(...args),
  escapeFormulaValue: (s: string) => s,
}));

const { childrenUnder14FromPositions } = await import('../lib/employees');

/** תקן פעיל עם השדות שהשליפה קוראת. */
function position(opts: { id: string; tz: string; children?: string; submittedAt?: string }) {
  return {
    id: opts.id,
    fields: {
      [POSITION_FIELDS.tzLookup]: [opts.tz],
      ...(opts.children !== undefined ? { [POSITION_FIELDS.childrenUnder14]: opts.children } : {}),
      ...(opts.submittedAt ? { [POSITION_FIELDS.submittedAt]: opts.submittedAt } : {}),
    },
  };
}

describe('childrenUnder14FromPositions', () => {
  beforeEach(() => listRecords.mockReset());

  it('מחזיר את התשובה מהתקן שהוגש אחרון', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', tz: '213277692', children: 'לא', submittedAt: '2026-08-01T10:00:00.000Z' }),
      position({ id: 'rec2', tz: '213277692', children: 'כן', submittedAt: '2026-08-25T12:19:06.000Z' }),
    ]);
    expect(await childrenUnder14FromPositions('213277692')).toBe('כן');
  });

  it('מדלג על תקנים ללא תשובה', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', tz: '213277692', submittedAt: '2026-08-25T12:00:00.000Z' }),
      position({ id: 'rec2', tz: '213277692', children: '', submittedAt: '2026-08-24T12:00:00.000Z' }),
      position({ id: 'rec3', tz: '213277692', children: 'כן', submittedAt: '2026-08-01T12:00:00.000Z' }),
    ]);
    expect(await childrenUnder14FromPositions('213277692')).toBe('כן');
  });

  it('לא לוקח תשובה מת.ז. אחרת שה-FIND תפס כתת-מחרוזת', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', tz: '1213277692', children: 'כן', submittedAt: '2026-08-25T12:00:00.000Z' }),
    ]);
    expect(await childrenUnder14FromPositions('213277692')).toBe('');
  });

  it('מחזיר ריק כשאין תקנים', async () => {
    listRecords.mockResolvedValue([]);
    expect(await childrenUnder14FromPositions('213277692')).toBe('');
  });

  it('לא פונה לאיירטייבל בלי ת.ז.', async () => {
    expect(await childrenUnder14FromPositions('  ')).toBe('');
    expect(listRecords).not.toHaveBeenCalled();
  });
});
