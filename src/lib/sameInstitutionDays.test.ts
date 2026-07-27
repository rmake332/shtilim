import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POSITION_FIELDS, SCHEDULE_FIELDS } from '../lib/airtable/schema';

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
}) {
  const fields: Record<string, unknown> = {
    [POSITION_FIELDS.mosadLookup]: [opts.mosadId],
    [POSITION_FIELDS.roleTitleText]: opts.role ?? 'סייעת',
    [POSITION_FIELDS.mosadNameText]: 'שתילים ירושלים',
    ...(opts.prevYear ? { [POSITION_FIELDS.prevYearStatus]: 'כן' } : {}),
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

const params = { tz: '318866779', mosadId: MOSAD_A };

describe('findSameInstitutionDays', () => {
  beforeEach(() => listRecords.mockReset());

  it('returns only the days that carry hours, with the position name and shifts', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_A, sun: ['08:00', '12:00'], tue: ['09:00', '11:30'] }),
    ]);

    const days = await findSameInstitutionDays(params);

    expect(Object.keys(days).sort()).toEqual(['sun', 'tue']);
    expect(days.sun).toEqual([
      { positionId: 'rec1', positionName: 'סייעת - שתילים ירושלים', shifts: ['08:00-12:00'] },
    ]);
    expect(days.tue?.[0].shifts).toEqual(['09:00-11:30']);
  });

  it('ignores positions at another institution', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_B, sun: ['08:00', '12:00'] }),
    ]);

    expect(await findSameInstitutionDays(params)).toEqual({});
  });

  it('ignores prior-year positions and the position being edited', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'recPrevYear', mosadId: MOSAD_A, sun: ['08:00', '12:00'], prevYear: true }),
      position({ id: 'recEdited', mosadId: MOSAD_A, tue: ['08:00', '12:00'] }),
    ]);

    const days = await findSameInstitutionDays({ ...params, excludePositionId: 'recEdited' });

    expect(days).toEqual({});
  });

  it('lists every position that occupies the same day', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_A, role: 'סייעת', sun: ['08:00', '12:00'] }),
      position({ id: 'rec2', mosadId: MOSAD_A, role: 'מטפלת', sun: ['13:00', '15:00'] }),
    ]);

    const days = await findSameInstitutionDays(params);

    expect(days.sun?.map((p) => p.positionId)).toEqual(['rec1', 'rec2']);
  });

  it('counts a day as occupied even when only one side of the shift is filled', async () => {
    listRecords.mockResolvedValue([
      { id: 'rec1', fields: {
        [POSITION_FIELDS.mosadLookup]: [MOSAD_A],
        [SCHEDULE_FIELDS.sun.in[0]]: secs('08:00'),
      } },
    ]);

    const days = await findSameInstitutionDays(params);

    expect(days.sun).toEqual([{ positionId: 'rec1', positionName: 'תקן קיים', shifts: [] }]);
  });
});
