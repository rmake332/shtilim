import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  shiftMinutes,
  validateDay,
  weeklyMinutes,
  roundToHalf,
  snapToHalf,
  paraDayHours,
  durationToHHMM,
  DAYS,
  type Shift,
  type Day,
} from './time';

describe('durationToHHMM', () => {
  it('converts seconds-from-midnight to HH:MM', () => {
    expect(durationToHHMM(54600)).toBe('15:10');
    expect(durationToHHMM(30600)).toBe('08:30');
    expect(durationToHHMM(0)).toBe('00:00');
  });
  it('rounds to the nearest minute', () => {
    expect(durationToHHMM(30629)).toBe('08:30');
    expect(durationToHHMM(30631)).toBe('08:31');
  });
  it('returns empty string for blank/invalid', () => {
    expect(durationToHHMM(null)).toBe('');
    expect(durationToHHMM(undefined)).toBe('');
    expect(durationToHHMM('')).toBe('');
    expect(durationToHHMM(-5)).toBe('');
  });
});

describe('toMinutes', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('08:00')).toBe(480);
    expect(toMinutes('8:30')).toBe(510);
  });
  it('rejects invalid', () => {
    expect(toMinutes('')).toBeNull();
    expect(toMinutes('25:00')).toBeNull();
    expect(toMinutes('abc')).toBeNull();
  });
});

describe('shiftMinutes', () => {
  it('computes duration', () => {
    expect(shiftMinutes({ in: '08:00', out: '16:00' })).toBe(480);
  });
  it('zero for incomplete', () => {
    expect(shiftMinutes({ in: '08:00', out: '' })).toBe(0);
  });
});

describe('validateDay', () => {
  it('accepts ordered non-overlapping shifts', () => {
    const shifts: Shift[] = [
      { in: '08:00', out: '13:00' },
      { in: '14:00', out: '16:00' },
    ];
    expect(validateDay(shifts).ok).toBe(true);
  });
  it('rejects exit before entry', () => {
    expect(validateDay([{ in: '08:00', out: '07:30' }]).ok).toBe(false);
  });
  it('rejects overlapping/earlier next shift', () => {
    const shifts: Shift[] = [
      { in: '08:00', out: '13:00' },
      { in: '12:00', out: '15:00' },
    ];
    expect(validateDay(shifts).ok).toBe(false);
  });
  it('skips fully-empty shifts', () => {
    expect(validateDay([{ in: '', out: '' }]).ok).toBe(true);
  });
});

describe('weeklyMinutes', () => {
  it('sums all days', () => {
    const week = Object.fromEntries(DAYS.map((d) => [d, [] as Shift[]])) as Record<Day, Shift[]>;
    week.sun = [{ in: '08:00', out: '16:00' }]; // 480
    week.mon = [{ in: '08:00', out: '12:00' }]; // 240
    expect(weeklyMinutes(week)).toBe(720);
  });
});

describe('roundToHalf', () => {
  it('rounds to nearest half', () => {
    expect(roundToHalf(5.2)).toBe(5);
    expect(roundToHalf(5.3)).toBe(5.5);
    expect(roundToHalf(5.75)).toBe(6);
    expect(roundToHalf(5)).toBe(5);
  });
});

describe('paraDayHours', () => {
  it('returns null for a rest day (0 minutes)', () => {
    expect(paraDayHours(0)).toBeNull();
  });
  it('returns error when below 80 minutes', () => {
    expect(paraDayHours(79)).toMatchObject({ ok: false, error: expect.any(String) });
    expect(paraDayHours(1)).toMatchObject({ ok: false, error: expect.any(String) });
  });
  it('deducts 35 for 80–99 minutes', () => {
    expect(paraDayHours(80)).toMatchObject({ ok: true, hours: (80 - 35) / 45 });
    expect(paraDayHours(90)).toMatchObject({ ok: true, hours: (90 - 35) / 45 });
    expect(paraDayHours(99)).toMatchObject({ ok: true, hours: (99 - 35) / 45 });
  });
  it('deducts 40 for 100+ minutes', () => {
    expect(paraDayHours(100)).toMatchObject({ ok: true, hours: (100 - 40) / 45 });
    expect(paraDayHours(135)).toMatchObject({ ok: true, hours: (135 - 40) / 45 });
  });
});

describe('snapToHalf', () => {
  // tolerance=0.3 — הוראה (bell schedule). roundToHalf always gives distance ≤0.25,
  // so tolerance=0.3 never returns null; it tests that snapping occurs correctly.
  it('snaps to nearest whole/half — הוראה (±0.3)', () => {
    expect(snapToHalf(16, 0.3)).toBe(16);
    expect(snapToHalf(16.5, 0.3)).toBe(16.5);
    expect(snapToHalf(16.25, 0.3)).toBe(16.5);
    expect(snapToHalf(15.72, 0.3)).toBe(15.5);
    expect(snapToHalf(16.3, 0.3)).toBe(16.5);
    expect(snapToHalf(16.2, 0.3)).toBe(16);
  });
  it('snaps within tolerance — פרא (±0.01)', () => {
    expect(snapToHalf(14, 0.01)).toBe(14);
    expect(snapToHalf(14.005, 0.01)).toBe(14);
    expect(snapToHalf(14.495, 0.01)).toBe(14.5);
  });
  it('returns null when farther than tolerance — פרא (±0.01)', () => {
    expect(snapToHalf(14.02, 0.01)).toBeNull();
    expect(snapToHalf(14.48, 0.01)).toBeNull();
    expect(snapToHalf(14.26, 0.01)).toBeNull();
  });
});
