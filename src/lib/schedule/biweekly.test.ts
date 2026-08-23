import { describe, it, expect } from 'vitest';
import { computeBiweeklyExcessHours, computeBiweeklyDeductionHours, type BiweeklyTrack } from './biweekly';
import type { Shift } from './time';

// מסלול לדוגמה: בשבוע המקוצר מסיימים בחמישי ב-13:00 ומתחילים בראשון ב-10:00.
const track: BiweeklyTrack = { thuEndMinutes: 13 * 60, sunStartMinutes: 10 * 60 };

function week(overrides: Partial<Record<'sun' | 'thu' | 'fri', Shift[]>>): Record<string, Shift[]> {
  return { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], ...overrides };
}

describe('computeBiweeklyExcessHours', () => {
  it('is 0 for an empty week', () => {
    expect(computeBiweeklyExcessHours(week({}), track)).toBe(0);
  });

  it('counts the late Thursday exit above the track', () => {
    const w = week({ thu: [{ in: '08:00', out: '15:00' }] }); // 2h past 13:00
    expect(computeBiweeklyExcessHours(w, track)).toBe(2);
  });

  it('does not count a Thursday exit at or before the track', () => {
    const w = week({ thu: [{ in: '08:00', out: '12:00' }] });
    expect(computeBiweeklyExcessHours(w, track)).toBe(0);
  });

  it('counts the early Sunday entry before the track', () => {
    const w = week({ sun: [{ in: '08:00', out: '16:00' }] }); // 2h before 10:00
    expect(computeBiweeklyExcessHours(w, track)).toBe(2);
  });

  it('does not count a Sunday entry at or after the track', () => {
    const w = week({ sun: [{ in: '10:00', out: '16:00' }] });
    expect(computeBiweeklyExcessHours(w, track)).toBe(0);
  });

  it('counts all of Friday, a full day not worked in the short week', () => {
    const w = week({ fri: [{ in: '08:00', out: '12:00' }] }); // 4h
    expect(computeBiweeklyExcessHours(w, track)).toBe(4);
  });

  it('uses the LAST Thursday shift and the FIRST Sunday shift when several are entered', () => {
    const w = week({
      thu: [{ in: '08:00', out: '10:00' }, { in: '11:00', out: '16:00' }], // last exit 16:00
      sun: [{ in: '07:00', out: '09:00' }, { in: '10:30', out: '13:00' }], // first entry 07:00
    });
    // חמישי: 16:00-13:00=3h, ראשון: 10:00-07:00=3h → 6h
    expect(computeBiweeklyExcessHours(w, track)).toBe(6);
  });

  it('sums all three components together', () => {
    const w = week({
      thu: [{ in: '08:00', out: '15:00' }], // +2h
      sun: [{ in: '08:00', out: '16:00' }], // +2h
      fri: [{ in: '08:00', out: '12:00' }], // +4h
    });
    expect(computeBiweeklyExcessHours(w, track)).toBe(8);
  });
});

describe('computeBiweeklyDeductionHours', () => {
  it('is exactly half the excess when that divides evenly', () => {
    const w = week({ thu: [{ in: '08:00', out: '15:00' }] }); // excess 2h → deduction 1h
    expect(computeBiweeklyDeductionHours(w, track)).toBe(1);
  });

  it('is exactly half the excess, not rounded to the nearest half hour', () => {
    const w = week({ thu: [{ in: '08:00', out: '14:20' }] }); // excess 1h20 = 80min → /2 = 40min = 0.67h
    expect(computeBiweeklyDeductionHours(w, track)).toBe(0.67);
  });

  it('matches a real report: thu exit 14:40 against a 13:00 track (excess 100min → deduction 50min)', () => {
    const w = week({ thu: [{ in: '07:30', out: '14:40' }] });
    expect(computeBiweeklyDeductionHours(w, track)).toBe(0.83);
  });

  it('is 0 when there is no excess', () => {
    expect(computeBiweeklyDeductionHours(week({}), track)).toBe(0);
  });
});
