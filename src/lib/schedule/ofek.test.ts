import { describe, it, expect } from 'vitest';
import {
  isMotherPosition,
  jobPercent,
  buildOfekKey,
  severeDisabilityBonus,
  paraStaySplit,
  paraDailyUnits,
  isParaEntry,
  ofekCategoryFor,
  ofekRowHoursSum,
  motherPositionFromOfekRow,
} from './ofek';

describe('jobPercent', () => {
  it('computes (hours/36)*100', () => {
    expect(jobPercent(36)).toBe(100);
    expect(jobPercent(18)).toBe(50);
  });
});

describe('isMotherPosition', () => {
  const base = { gender: 'נקבה', maritalStatus: 'נשוי/ה', hasChildrenUnder14: true, jobPercent: 80 };
  it('true when all conditions met', () => {
    expect(isMotherPosition(base)).toBe(true);
  });
  it('false for male', () => {
    expect(isMotherPosition({ ...base, gender: 'זכר' })).toBe(false);
  });
  it('false for single', () => {
    expect(isMotherPosition({ ...base, maritalStatus: 'רווק/ה' })).toBe(false);
  });
  it('false without children', () => {
    expect(isMotherPosition({ ...base, hasChildrenUnder14: false })).toBe(false);
  });
  it('false below 79%', () => {
    expect(isMotherPosition({ ...base, jobPercent: 78 })).toBe(false);
  });
});

// הבדיקה השנייה בפרא: אחוז המשרה נגזר מהפלט של המחשבון ולא מהשעות שהוזנו.
describe('motherPositionFromOfekRow', () => {
  const eligible = { gender: 'נקבה', maritalStatus: 'נשוי/ה', hasChildrenUnder14: true };

  it('sums frontal + individual + stay', () => {
    expect(ofekRowHoursSum({ frontalHours: 24, individualHours: 3, stayHours: 7 })).toBe(34);
  });

  it('כן למרות שהשעות שהוזנו מתחת לסף — 27 שעות שהוזנו, 34 שעות בפלט', () => {
    // יסודי0לאפרא27 → אחוז לפי הזנה 75%, אחוז לפי פלט 94%
    expect(isMotherPosition({ ...eligible, jobPercent: jobPercent(27) })).toBe(false);
    const res = motherPositionFromOfekRow({ frontalHours: 24, individualHours: 3, stayHours: 7 }, eligible);
    expect(res.jobPercent).toBeCloseTo(94.44, 2);
    expect(res.motherPosition).toBe(true);
  });

  it('לא כשגם סכום הפלט מתחת לסף', () => {
    const res = motherPositionFromOfekRow({ frontalHours: 15, individualHours: 2, stayHours: 4 }, eligible);
    expect(res.motherPosition).toBe(false);
  });

  it('שאר תנאי משרת אם ממשיכים לחסום גם כשהאחוז גבוה', () => {
    const row = { frontalHours: 24, individualHours: 3, stayHours: 7 };
    expect(motherPositionFromOfekRow(row, { ...eligible, gender: 'זכר' }).motherPosition).toBe(false);
    expect(motherPositionFromOfekRow(row, { ...eligible, maritalStatus: 'רווק/ה' }).motherPosition).toBe(false);
    expect(motherPositionFromOfekRow(row, { ...eligible, hasChildrenUnder14: false }).motherPosition).toBe(false);
  });
});

describe('buildOfekKey', () => {
  it('concatenates in correct order', () => {
    expect(
      buildOfekKey({ layer: 'חטיבה', ageHours: 0, motherPosition: true, category: 'הוראה', totalHours: 5 }),
    ).toBe('חטיבה0כןהוראה5');
    expect(
      buildOfekKey({ layer: 'יסודי', ageHours: 4, motherPosition: false, category: 'פרא', totalHours: 14 }),
    ).toBe('יסודי4לאפרא14');
  });
});

// התוספת מחושבת לתצוגה בלבד - אינה מתווספת ל-finalHours ואינה מנוצלת מהתקן.
describe('severeDisabilityBonus', () => {
  const base = { severeDisabilityFlag: true, enteredHours: 10 };
  it('0 when flag off', () => {
    expect(severeDisabilityBonus({ ...base, severeDisabilityFlag: false })).toBe(0);
  });
  it('+1 under 15h', () => {
    expect(severeDisabilityBonus({ ...base, enteredHours: 10 })).toBe(1);
  });
  it('+2 at 15h', () => {
    expect(severeDisabilityBonus({ ...base, enteredHours: 15 })).toBe(2);
  });
  it('+2 over 15h', () => {
    expect(severeDisabilityBonus({ ...base, enteredHours: 20 })).toBe(2);
  });
});

describe('paraStaySplit', () => {
  it('institution when paraBoard', () => {
    expect(paraStaySplit({ paraBoard: true, layer: 'חטיבה', category: 'פרא רפואי', isBehaviorAnalyst: false })).toBe(
      'institution',
    );
  });
  it('institution when layer=גנים', () => {
    expect(paraStaySplit({ paraBoard: false, layer: 'גנים', category: 'פרא רפואי', isBehaviorAnalyst: false })).toBe(
      'institution',
    );
  });
  it('home when not paraBoard, layer≠גנים, category≠הוראה, not analyst', () => {
    expect(paraStaySplit({ paraBoard: false, layer: 'חטיבה', category: 'פרא רפואי', isBehaviorAnalyst: false })).toBe(
      'home',
    );
  });
});

describe('paraDailyUnits', () => {
  it('divides minutes by 45', () => {
    expect(paraDailyUnits(450)).toBe(10);
    expect(paraDailyUnits(45)).toBe(1);
  });
});

describe('isParaEntry', () => {
  it('true for פרא and הוראה - לוח פרא', () => {
    expect(isParaEntry('פרא')).toBe(true);
    expect(isParaEntry('הוראה - לוח פרא')).toBe(true);
  });
  it('false for רגיל — including a פרא רפואי role whose schedule type is רגיל', () => {
    expect(isParaEntry('רגיל')).toBe(false);
  });
  it('false for the remaining schedule types and for a missing value', () => {
    expect(isParaEntry('הוראה')).toBe(false);
    expect(isParaEntry('סגן ראשון')).toBe(false);
    expect(isParaEntry('מנהל/ת')).toBe(false);
    expect(isParaEntry(null)).toBe(false);
  });
});

describe('ofekCategoryFor', () => {
  it('maps פרא to the פרא ofek table', () => {
    expect(ofekCategoryFor('פרא')).toBe('פרא');
  });
  it('maps both teaching types to the הוראה ofek table', () => {
    expect(ofekCategoryFor('הוראה')).toBe('הוראה');
    expect(ofekCategoryFor('הוראה - לוח פרא')).toBe('הוראה');
  });
  it('returns null when the role is not measured by ofek', () => {
    expect(ofekCategoryFor('רגיל')).toBeNull();
    expect(ofekCategoryFor('סגן ראשון')).toBeNull();
    expect(ofekCategoryFor('מילוי מקום')).toBeNull();
    expect(ofekCategoryFor(null)).toBeNull();
  });
});
