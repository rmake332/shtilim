import { describe, it, expect } from 'vitest';
import { overnightAllowed, weekShiftsOverlap } from './overnight';
import { restBetweenDaysError, breakDayError, breakPolicyFor, dailyPresenceError } from './breaks';
import { computeBiweeklyExcessHours } from './biweekly';

describe('overnightAllowed', () => {
  const boarding = { layer: 'פנימיה', youth: false };
  it('פנימיה, ימי חול ומוצ"ש', () => {
    expect(overnightAllowed('sun', boarding)).toBe(true);
    expect(overnightAllowed('thu', boarding)).toBe(true);
    expect(overnightAllowed('motzash', boarding)).toBe(true);
  });
  it('לא בשישי', () => {
    expect(overnightAllowed('fri', boarding)).toBe(false);
  });
  it('לא מחוץ לפנימיה ולא לנוער', () => {
    expect(overnightAllowed('sun', { layer: 'יסודי', youth: false })).toBe(false);
    expect(overnightAllowed('sun', { layer: 'פנימיה', youth: true })).toBe(false);
  });
});

describe('weekShiftsOverlap', () => {
  it('משמרת לילה בראשון חופפת לבוקר של שני', () => {
    expect(weekShiftsOverlap('sun', { in: '22:00', out: '06:00' }, 'mon', { in: '05:00', out: '09:00' })).toBe(true);
    expect(weekShiftsOverlap('sun', { in: '22:00', out: '06:00' }, 'mon', { in: '06:00', out: '09:00' })).toBe(false);
  });
  it('מוצ"ש שגולש לראשון חופף לראשון בבוקר', () => {
    expect(weekShiftsOverlap('motzash', { in: '21:00', out: '07:00' }, 'sun', { in: '06:30', out: '12:00' })).toBe(true);
    expect(weekShiftsOverlap('sun', { in: '06:30', out: '12:00' }, 'motzash', { in: '21:00', out: '07:00' })).toBe(true);
  });
  it('אותו יום, בלי משמרות לילה - כמו קודם', () => {
    expect(weekShiftsOverlap('tue', { in: '08:00', out: '12:00' }, 'tue', { in: '11:00', out: '14:00' })).toBe(true);
    expect(weekShiftsOverlap('tue', { in: '08:00', out: '12:00' }, 'wed', { in: '08:00', out: '12:00' })).toBe(false);
  });
});

describe('משמרת לילה במנוחה, בהפסקה ובתקרה היומית', () => {
  const policy = breakPolicyFor({ scheduleType: 'רגיל', layer: 'פנימיה', twelveHourEmployment: false });
  const night = [{ in: '22:00', out: '06:00' }];

  it('מנוחה נמדדת מהיציאה למחרת', () => {
    expect(restBetweenDaysError(night, [{ in: '14:00', out: '20:00' }])).toBeNull();
    expect(restBetweenDaysError(night, [{ in: '12:00', out: '20:00' }])).toContain('מנוחה');
  });
  it('יום שמתחיל לפני סיום משמרת הלילה', () => {
    expect(restBetweenDaysError(night, [{ in: '05:00', out: '08:00' }])).toContain('לפני שמשמרת הלילה');
  });
  it('הפסקה אחרי חצות בתוך משמרת לילה', () => {
    const long = [{ in: '20:00', out: '07:00' }];
    expect(breakDayError(long, { in: '02:00', out: '02:30' }, 11, policy)).toBeNull();
    expect(breakDayError(long, { in: '23:45', out: '00:15' }, 11, policy)).toBeNull();
    expect(breakDayError(long, { in: '07:30', out: '08:00' }, 11, policy)).toContain('בתוך שעות העבודה');
  });
  it('תקרת 12 שעות נספרת על המשמרת כולה', () => {
    expect(dailyPresenceError([{ in: '19:00', out: '08:00' }])).toContain('12');
    expect(dailyPresenceError(night)).toBeNull();
  });
});

describe('דו-שבועי עם משמרת לילה בחמישי', () => {
  it('היציאה בשישי נמדדת מעבר לחצות', () => {
    const week = { thu: [{ in: '22:00', out: '02:00' }], sun: [], fri: [] };
    // מסלול: סיום חמישי 14:00 → עודף 12 שעות (עד 02:00 בלילה).
    expect(computeBiweeklyExcessHours(week, { thuEndMinutes: 14 * 60, sunStartMinutes: 0 })).toBe(12);
  });
});
