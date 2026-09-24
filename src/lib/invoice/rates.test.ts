import { describe, it, expect } from 'vitest';
import { maxHourlyRateFor, monthlyToWeekly, workDaysInMonth, weeksInMonth, monthlyHoursFor } from './rates';

describe('maxHourlyRateFor', () => {
  it('divides the monthly tariff by weekly hours * 4.3 and adds 20%', () => {
    // 9500 / (50 * 4.3) = 44.186..., * 1.2 = 53.02
    expect(maxHourlyRateFor(9500, 50)).toBe(53.02);
  });

  it('caps at 350', () => {
    expect(maxHourlyRateFor(100000, 10)).toBe(350);
  });

  it('returns null without hours or tariff', () => {
    expect(maxHourlyRateFor(9500, 0)).toBeNull();
    expect(maxHourlyRateFor(0, 50)).toBeNull();
  });
});

describe('monthlyToWeekly', () => {
  it('divides by 4.3', () => {
    expect(monthlyToWeekly(43)).toBe(10);
    expect(monthlyToWeekly(100)).toBe(23.26);
  });
});

describe('workDaysInMonth / weeksInMonth', () => {
  it('counts Sunday to Thursday', () => {
    // ספטמבר 2026: 1.9 יום שלישי, 30 ימים -> 22 ימי א-ה
    expect(workDaysInMonth('2026-09')).toBe(22);
    expect(weeksInMonth('2026-09')).toBe(4.4);
    // פברואר 2026: 1.2 יום ראשון, 28 ימים -> 4 שבועות מלאים
    expect(workDaysInMonth('2026-02')).toBe(20);
    expect(weeksInMonth('2026-02')).toBe(4);
  });

  it('returns 0 for a malformed month', () => {
    expect(workDaysInMonth('2026-9')).toBe(0);
  });
});

describe('monthlyHoursFor', () => {
  it('multiplies weekly hours by the month weeks', () => {
    expect(monthlyHoursFor(10, '2026-09')).toBe(44);
    expect(monthlyHoursFor(10, '2026-02')).toBe(40);
  });
});
