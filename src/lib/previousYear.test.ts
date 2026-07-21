import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PREV_YEAR_FIELDS } from '../lib/airtable/schema';

vi.mock('server-only', () => ({}));

const fetchPrevYearRowsByTz = vi.fn();
vi.mock('../lib/prevYearPosition', () => ({
  fetchPrevYearRowsByTz: (tz: string) => fetchPrevYearRowsByTz(tz),
}));

const { getPreviousYearHours } = await import('../lib/previousYear');

/** A תקנים תשפו row with the fields the sum reads. */
function prevRow(opts: {
  tz: string;
  mosad?: string;
  category?: string;
  layer?: string;
  hours: number;
}) {
  return {
    id: `rec${opts.tz}${opts.hours}`,
    fields: {
      [PREV_YEAR_FIELDS.tz]: opts.tz,
      [PREV_YEAR_FIELDS.mosad]: opts.mosad ?? 'אור חדש',
      [PREV_YEAR_FIELDS.category]: [opts.category ?? 'הוראה'], // multipleSelects
      [PREV_YEAR_FIELDS.layer]: opts.layer ?? 'יסודי',
      [PREV_YEAR_FIELDS.weeklyHours]: opts.hours,
    },
  };
}

const params = { tz: '318866779', category: 'הוראה', mosadName: 'אור חדש', layer: 'יסודי' };

describe('getPreviousYearHours', () => {
  beforeEach(() => fetchPrevYearRowsByTz.mockReset());

  it('sums every prior position in the same category + מוסד + שכבה', async () => {
    fetchPrevYearRowsByTz.mockResolvedValue([
      prevRow({ tz: params.tz, hours: 20 }),
      prevRow({ tz: params.tz, hours: 11.25 }),
    ]);

    expect(await getPreviousYearHours(params)).toBe(31.25);
  });

  it('ignores rows from another מוסד, קטגוריה, שכבה or employee', async () => {
    fetchPrevYearRowsByTz.mockResolvedValue([
      prevRow({ tz: params.tz, hours: 20 }),
      prevRow({ tz: params.tz, mosad: 'אור חדש בוגרים', hours: 5 }),
      prevRow({ tz: params.tz, category: 'סיוע', hours: 5 }),
      prevRow({ tz: params.tz, layer: 'חטיבה', hours: 5 }),
      prevRow({ tz: '111111118', hours: 5 }),
    ]);

    expect(await getPreviousYearHours(params)).toBe(20);
  });

  it('matches ת.ז. regardless of leading zeros', async () => {
    fetchPrevYearRowsByTz.mockResolvedValue([prevRow({ tz: '039801956', hours: 7 })]);

    expect(await getPreviousYearHours({ ...params, tz: '39801956' })).toBe(7);
  });

  it('returns null when the employee had no matching prior position', async () => {
    fetchPrevYearRowsByTz.mockResolvedValue([prevRow({ tz: params.tz, layer: 'גנים', hours: 30 })]);

    // null (skip the check), not 0 — a missing prior row is not a drop to zero.
    expect(await getPreviousYearHours(params)).toBeNull();
  });

  it('returns 0 when a prior position exists with no hours', async () => {
    fetchPrevYearRowsByTz.mockResolvedValue([prevRow({ tz: params.tz, hours: 0 })]);

    expect(await getPreviousYearHours(params)).toBe(0);
  });

  it('skips the שכבה filter when the form has no layer', async () => {
    fetchPrevYearRowsByTz.mockResolvedValue([
      prevRow({ tz: params.tz, layer: 'יסודי', hours: 10 }),
      prevRow({ tz: params.tz, layer: 'חטיבה', hours: 4 }),
    ]);

    expect(await getPreviousYearHours({ ...params, layer: '' })).toBe(14);
  });
});
