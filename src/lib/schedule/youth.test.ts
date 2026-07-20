import { describe, it, expect } from 'vitest';
import {
  youthLimitsFor,
  youthDayError,
  youthWeeklyError,
  youthSlotAllowed,
  youthTimeError,
  withinYouthWindow,
} from './youth';

/** תאריך לידה שנותן בדיוק את הגיל המבוקש נכון להיום. */
function birthDateForAge(age: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  // יום אחד אחורה כדי לא ליפול על גבול יום ההולדת עצמו
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('youthLimitsFor', () => {
  it('גיל 14–16 — 8 שעות ביום, 08:00–20:00', () => {
    const l = youthLimitsFor(birthDateForAge(15))!;
    expect(l).toEqual({ maxDailyHours: 8, maxWeeklyHours: 40, earliest: '08:00', latest: '20:00' });
  });
  it('גיל 16–18 — 9 שעות ביום, 06:00–22:00', () => {
    const l = youthLimitsFor(birthDateForAge(17))!;
    expect(l).toEqual({ maxDailyHours: 9, maxWeeklyHours: 40, earliest: '06:00', latest: '22:00' });
  });
  it('בגיר או תאריך חסר — אין מגבלה', () => {
    expect(youthLimitsFor(birthDateForAge(18))).toBeNull();
    expect(youthLimitsFor(birthDateForAge(30))).toBeNull();
    expect(youthLimitsFor('')).toBeNull();
    expect(youthLimitsFor(undefined)).toBeNull();
  });
});

const UNDER_16 = youthLimitsFor(birthDateForAge(15))!;
const AGE_17 = youthLimitsFor(birthDateForAge(17))!;

describe('withinYouthWindow / youthTimeError', () => {
  it('גבולות החלון כלולים', () => {
    expect(withinYouthWindow('08:00', UNDER_16)).toBe(true);
    expect(withinYouthWindow('20:00', UNDER_16)).toBe(true);
    expect(withinYouthWindow('07:59', UNDER_16)).toBe(false);
    expect(withinYouthWindow('20:01', UNDER_16)).toBe(false);
  });
  it('שעה ריקה או לא תקינה אינה נחסמת כאן', () => {
    expect(withinYouthWindow('', UNDER_16)).toBe(true);
    expect(youthTimeError('', UNDER_16)).toBeNull();
  });
  it('הודעות שגיאה', () => {
    expect(youthTimeError('07:30', UNDER_16)).toBe('לא לפני 08:00');
    expect(youthTimeError('21:00', UNDER_16)).toBe('לא אחרי 20:00');
    expect(youthTimeError('07:30', AGE_17)).toBeNull();
    expect(youthTimeError('22:30', AGE_17)).toBe('לא אחרי 22:00');
  });
});

describe('youthDayError', () => {
  it('יום תקין', () => {
    expect(youthDayError([{ in: '08:00', out: '14:00' }], UNDER_16)).toBeNull();
  });
  it('כניסה מוקדמת מדי נחסמת', () => {
    expect(youthDayError([{ in: '07:00', out: '12:00' }], UNDER_16)).toContain('כניסה לפני 08:00');
  });
  it('יציאה מאוחרת מדי נחסמת', () => {
    expect(youthDayError([{ in: '14:00', out: '21:00' }], UNDER_16)).toContain('יציאה אחרי 20:00');
  });
  it('חריגה מהמכסה היומית נחסמת — גם בפיצול משמרות', () => {
    expect(youthDayError([{ in: '08:00', out: '17:00' }], UNDER_16)).toContain('עד 8 שעות ביום');
    expect(
      youthDayError([{ in: '08:00', out: '13:00' }, { in: '14:00', out: '18:30' }], UNDER_16),
    ).toContain('עד 8 שעות ביום');
    // בן 17 — עד 9 שעות, לכן 9 שעות רצופות תקינות
    expect(youthDayError([{ in: '08:00', out: '17:00' }], AGE_17)).toBeNull();
  });
  it('מכסה יומית בדיוק על הגבול מותרת', () => {
    expect(youthDayError([{ in: '08:00', out: '16:00' }], UNDER_16)).toBeNull();
  });
});

describe('youthWeeklyError', () => {
  it('עד 40 שעות מותר', () => {
    expect(youthWeeklyError(40, UNDER_16)).toBeNull();
    expect(youthWeeklyError(40.5, UNDER_16)).toContain('עד 40 שעות שבועיות');
  });
});

describe('youthSlotAllowed', () => {
  it('רצועה בתוך החלון מותרת', () => {
    expect(youthSlotAllowed({ in: '08:00', out: '08:45' }, UNDER_16)).toBe(true);
  });
  it('רצועה מחוץ לחלון נחסמת', () => {
    expect(youthSlotAllowed({ in: '07:15', out: '08:00' }, UNDER_16)).toBe(false);
    expect(youthSlotAllowed({ in: '19:30', out: '20:15' }, UNDER_16)).toBe(false);
    expect(youthSlotAllowed({ in: '07:15', out: '08:00' }, AGE_17)).toBe(true);
  });
  it('רצועה ארוכה מהמכסה היומית נחסמת', () => {
    expect(youthSlotAllowed({ in: '08:00', out: '19:00' }, UNDER_16)).toBe(false);
  });
});
