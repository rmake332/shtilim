import { describe, it, expect } from 'vitest';
import {
  breakPolicyFor,
  requiredBreakMinutes,
  breakDayError,
  dailyPresenceError,
  restBetweenDaysError,
  breakMinutes,
  totalBreakMinutes,
  formatBreakMinutes,
  FIXED_BREAK_MINUTES,
  TWELVE_HOUR_WEEKLY_CAP,
} from './breaks';

const REGULAR = breakPolicyFor({ scheduleType: 'רגיל', layer: 'יסודי', twelveHourEmployment: false });
const PARA = breakPolicyFor({ scheduleType: 'פרא', layer: 'יסודי', twelveHourEmployment: false });
const BOARDING = breakPolicyFor({ scheduleType: 'רגיל', layer: 'פנימיה', twelveHourEmployment: false });

describe('breakPolicyFor', () => {
  it('רגיל — שעון, השלמה ל-8.5, מנוכה', () => {
    expect(REGULAR).toEqual({ twelveHour: false, metric: 'clock', fixedHalfHour: false, deducts: true });
  });
  it('סגן ראשון — כמו רגיל', () => {
    expect(breakPolicyFor({ scheduleType: 'סגן ראשון', layer: 'יסודי', twelveHourEmployment: false }).metric)
      .toBe('clock');
  });
  it('פרא — אקדמי, חצי שעה, לא מנוכה', () => {
    expect(PARA).toEqual({ twelveHour: false, metric: 'academic', fixedHalfHour: true, deducts: false });
  });
  it('הוראה ו"הוראה - לוח פרא" — אקדמי', () => {
    expect(breakPolicyFor({ scheduleType: 'הוראה', layer: 'יסודי', twelveHourEmployment: false }).metric)
      .toBe('academic');
    expect(breakPolicyFor({ scheduleType: 'הוראה - לוח פרא', layer: 'יסודי', twelveHourEmployment: false }).metric)
      .toBe('academic');
  });
  it('שכבת פנימיה מפעילה את מסלול 12 השעות', () => {
    expect(BOARDING).toEqual({ twelveHour: true, metric: 'clock', fixedHalfHour: true, deducts: true });
  });
  it('דגל "העסקה 12 שעות" על העובד מפעיל את המסלול גם בשכבה רגילה', () => {
    const p = breakPolicyFor({ scheduleType: 'רגיל', layer: 'יסודי', twelveHourEmployment: true });
    expect(p.twelveHour).toBe(true);
    expect(p.fixedHalfHour).toBe(true);
  });
  it('sanity — התקרה השבועית במסלול 12 שעות היא 52', () => {
    expect(TWELVE_HOUR_WEEKLY_CAP).toBe(52);
  });
});

describe('requiredBreakMinutes', () => {
  it('עד 8.5 שעות — אין הפסקה', () => {
    expect(requiredBreakMinutes(8.5, REGULAR)).toBe(0);
    expect(requiredBreakMinutes(4, REGULAR)).toBe(0);
    expect(requiredBreakMinutes(8.5, BOARDING)).toBe(0);
    expect(requiredBreakMinutes(8.5, PARA)).toBe(0);
  });
  it('רגיל — השלמה ל-8.5: 9:15 נוכחות → 45 דק׳', () => {
    expect(requiredBreakMinutes(9.25, REGULAR)).toBe(45);
  });
  it('רגיל — 10 שעות → שעה וחצי', () => {
    expect(requiredBreakMinutes(10, REGULAR)).toBe(90);
  });
  it('פרא ופנימיה — חצי שעה בדיוק ללא קשר לגודל היום', () => {
    expect(requiredBreakMinutes(9, PARA)).toBe(FIXED_BREAK_MINUTES);
    expect(requiredBreakMinutes(11.75, PARA)).toBe(FIXED_BREAK_MINUTES);
    expect(requiredBreakMinutes(12, BOARDING)).toBe(FIXED_BREAK_MINUTES);
  });
  it('אינו מופעל בשגיאת עיגול זעירה של שעות אקדמיות', () => {
    expect(requiredBreakMinutes(8.5 + 1e-12, PARA)).toBe(0);
  });
});

describe('breakDayError', () => {
  const day = [{ in: '07:00', out: '17:00' }]; // 10 שעות → נדרשות 90 דק׳

  it('יום מתחת לסף — אין שגיאה גם ללא הפסקה', () => {
    expect(breakDayError([{ in: '08:00', out: '16:00' }], undefined, 8, REGULAR)).toBeNull();
  });
  it('הפסקה חסרה — שגיאה', () => {
    expect(breakDayError(day, undefined, 10, REGULAR)).toMatch(/נדרשת הזנת הפסקה/);
  });
  it('הפסקה חלקית — שגיאה', () => {
    expect(breakDayError(day, { in: '12:00', out: '' }, 10, REGULAR)).toBe('יש למלא כניסה ויציאה להפסקה');
  });
  it('יציאה מוקדמת מהכניסה — שגיאה', () => {
    expect(breakDayError(day, { in: '13:00', out: '12:00' }, 10, REGULAR)).toMatch(/מוקדמת/);
  });
  it('הפסקה מחוץ לשעות העבודה — שגיאה', () => {
    expect(breakDayError(day, { in: '18:00', out: '19:30' }, 10, REGULAR)).toBe(
      'ההפסקה חייבת להיות בתוך שעות העבודה של אותו יום',
    );
    expect(breakDayError(day, { in: '06:00', out: '07:30' }, 10, REGULAR)).toMatch(/בתוך שעות העבודה/);
  });
  it('משך נכון — תקין', () => {
    expect(breakDayError(day, { in: '12:00', out: '13:30' }, 10, REGULAR)).toBeNull();
  });
  it('משך שגוי בהשלמה ל-8.5 — שגיאה שמציינת את הנדרש', () => {
    const err = breakDayError(day, { in: '12:00', out: '13:00' }, 10, REGULAR)!;
    expect(err).toMatch(/1.5 שעות/);
    expect(err).toMatch(/הוזנו שעה/);
  });
  it('פנימיה — חצי שעה בדיוק, לא יותר ולא פחות', () => {
    const shifts = [{ in: '07:00', out: '18:00' }];
    expect(breakDayError(shifts, { in: '12:00', out: '12:30' }, 11, BOARDING)).toBeNull();
    expect(breakDayError(shifts, { in: '12:00', out: '13:00' }, 11, BOARDING)).toMatch(/30 דק׳ בדיוק/);
    expect(breakDayError(shifts, { in: '12:00', out: '12:15' }, 11, BOARDING)).toMatch(/30 דק׳ בדיוק/);
  });
  it('פרא — הסף נמדד בשעות אקדמיות, וההפסקה היא חצי שעה', () => {
    const shifts = [{ in: '08:00', out: '15:30' }];
    expect(breakDayError(shifts, undefined, 8.4, PARA)).toBeNull();
    expect(breakDayError(shifts, { in: '11:00', out: '11:30' }, 8.6, PARA)).toBeNull();
  });
});

describe('dailyPresenceError', () => {
  it('12 שעות בדיוק — תקין', () => {
    expect(dailyPresenceError([{ in: '07:00', out: '19:00' }])).toBeNull();
  });
  it('מעל 12 שעות — שגיאה', () => {
    expect(dailyPresenceError([{ in: '06:00', out: '19:00' }])).toMatch(/12 שעות ביום/);
  });
  it('מסתכם על פני כמה משמרות', () => {
    expect(
      dailyPresenceError([
        { in: '06:00', out: '13:00' },
        { in: '14:00', out: '21:00' },
      ]),
    ).toMatch(/הוזנו 14/);
  });
});

describe('restBetweenDaysError', () => {
  it('מנוחה של 8 שעות בדיוק — תקין', () => {
    expect(restBetweenDaysError([{ in: '10:00', out: '22:00' }], [{ in: '06:00', out: '12:00' }])).toBeNull();
  });
  it('פחות מ-8 שעות — שגיאה', () => {
    const err = restBetweenDaysError([{ in: '10:00', out: '22:00' }], [{ in: '05:00', out: '12:00' }])!;
    expect(err).toMatch(/מנוחה של 8 שעות/);
    expect(err).toMatch(/הוזנו 7/);
  });
  it('יום ריק אינו מייצר בדיקה', () => {
    expect(restBetweenDaysError([], [{ in: '05:00', out: '12:00' }])).toBeNull();
    expect(restBetweenDaysError([{ in: '10:00', out: '22:00' }], [])).toBeNull();
  });
  it('נמדד מהיציאה האחרונה לכניסה הראשונה', () => {
    const prev = [
      { in: '08:00', out: '12:00' },
      { in: '16:00', out: '23:00' },
    ];
    expect(restBetweenDaysError(prev, [{ in: '06:00', out: '10:00' }])).toMatch(/הוזנו 7/);
  });
});

describe('עזרי חישוב', () => {
  it('breakMinutes — משך או 0', () => {
    expect(breakMinutes({ in: '12:00', out: '12:45' })).toBe(45);
    expect(breakMinutes(undefined)).toBe(0);
    expect(breakMinutes({ in: '', out: '' })).toBe(0);
  });
  it('totalBreakMinutes — סכום השבוע', () => {
    const breaks = { sun: { in: '12:00', out: '13:30' }, mon: { in: '12:00', out: '12:30' } };
    expect(totalBreakMinutes(breaks, ['sun', 'mon', 'tue'])).toBe(120);
  });
  it('formatBreakMinutes — דקות עד שעה, אחרת שעות', () => {
    expect(formatBreakMinutes(45)).toBe('45 דק׳');
    expect(formatBreakMinutes(60)).toBe('שעה');
    expect(formatBreakMinutes(90)).toBe('1.5 שעות');
  });
});
