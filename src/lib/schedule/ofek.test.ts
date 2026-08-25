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
  jobPercentBase,
  computeUtilizedHours,
  includeExistingStayInCombinedKey,
} from './ofek';

describe('jobPercent', () => {
  it('computes (hours/36)*100 when there are no age hours', () => {
    expect(jobPercent(36, 0)).toBe(100);
    expect(jobPercent(18, 0)).toBe(50);
  });

  // בסיס אחוז המשרה הוא 36 בניכוי שעות הגיל.
  it('שעות גיל מקטינות את הבסיס', () => {
    expect(jobPercentBase(0)).toBe(36);
    expect(jobPercentBase(2)).toBe(34);
    expect(jobPercentBase(4)).toBe(32);
    expect(jobPercent(34, 2)).toBe(100);
    expect(jobPercent(32, 4)).toBe(100);
  });

  it('שעות גיל כמחרוזת ובלי ערך', () => {
    expect(jobPercentBase('4')).toBe(32);
    expect(jobPercentBase('')).toBe(36);
  });

  it('שעות גיל בלתי אפשריות אינן מחלקות באפס או בשלילי', () => {
    expect(jobPercentBase(36)).toBe(36);
    expect(jobPercentBase(40)).toBe(36);
  });

  // 28.44 שעות הן 79% מ-36, אבל רק 79% מ-32 הן 25.28 שעות.
  it('שעות גיל מורידות את סף משרת אם', () => {
    expect(jobPercent(26, 0)).toBeCloseTo(72.22, 2);
    expect(jobPercent(26, 4)).toBeCloseTo(81.25, 2);
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
  const eligible = { gender: 'נקבה', maritalStatus: 'נשוי/ה', hasChildrenUnder14: true, ageHours: 0 };

  it('sums frontal + individual + stay', () => {
    expect(ofekRowHoursSum({ frontalHours: 24, individualHours: 3, stayHours: 7 })).toBe(34);
  });

  it('כן למרות שהשעות שהוזנו מתחת לסף — 27 שעות שהוזנו, 34 שעות בפלט', () => {
    // יסודי0לאפרא27 → אחוז לפי הזנה 75%, אחוז לפי פלט 94%
    expect(isMotherPosition({ ...eligible, jobPercent: jobPercent(27, 0) })).toBe(false);
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

  // משרת אם נקבעת לפי היקף ההעסקה הכולל של העובד בכל תקניו, ולא לפי תקן בודד.
  it('שעות יתר התקנים מצטרפות לאחוז המשרה', () => {
    const row = { frontalHours: 8, individualHours: 1, stayHours: 3 }; // 12 שעות בתקן הנוכחי
    expect(motherPositionFromOfekRow(row, eligible).motherPosition).toBe(false);

    const res = motherPositionFromOfekRow(row, eligible, 17);
    expect(res.jobPercent).toBeCloseTo(80.56, 2); // (12 + 17) / 36
    expect(res.motherPosition).toBe(true);
  });

  it('היקף אפס ביתר התקנים זהה לחישוב ללא הפרמטר', () => {
    const row = { frontalHours: 24, individualHours: 3, stayHours: 7 };
    expect(motherPositionFromOfekRow(row, eligible, 0)).toEqual(motherPositionFromOfekRow(row, eligible));
  });

  // הבסיס קטן, ולכן אותן שעות בדיוק הופכות למשרת אם.
  it('שעות גיל מצטרפות לחישוב דרך בסיס אחוז המשרה', () => {
    const row = { frontalHours: 18, individualHours: 3, stayHours: 5 }; // 26 שעות
    expect(motherPositionFromOfekRow(row, eligible).motherPosition).toBe(false);

    const res = motherPositionFromOfekRow(row, { ...eligible, ageHours: 4 });
    expect(res.jobPercent).toBeCloseTo(81.25, 2); // 26 / 32
    expect(res.motherPosition).toBe(true);
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
  it('maps הוראה ללא שהייה to its own ofek table', () => {
    expect(ofekCategoryFor('הוראה ללא שהייה')).toBe('הוראה_ללא_שהייה');
  });
  it('returns null when the role is not measured by ofek', () => {
    expect(ofekCategoryFor('רגיל')).toBeNull();
    expect(ofekCategoryFor('סגן ראשון')).toBeNull();
    expect(ofekCategoryFor('מילוי מקום')).toBeNull();
    expect(ofekCategoryFor(null)).toBeNull();
  });
});

describe('includeExistingStayInCombinedKey', () => {
  it('הוראה והוראה - לוח פרא: שהיית התקנים הקיימים נכנסת בכל שכבה', () => {
    expect(includeExistingStayInCombinedKey('הוראה', 'יסודי')).toBe(true);
    expect(includeExistingStayInCombinedKey('הוראה', 'חטיבה')).toBe(true);
    expect(includeExistingStayInCombinedKey('הוראה', 'גנים')).toBe(true);
    expect(includeExistingStayInCombinedKey('הוראה - לוח פרא', 'חטיבה')).toBe(true);
    expect(includeExistingStayInCombinedKey('הוראה - לוח פרא', 'גנים')).toBe(true);
  });
  it('הוראה ללא שהייה: לעולם לא, גם בגנים', () => {
    expect(includeExistingStayInCombinedKey('הוראה ללא שהייה', 'יסודי')).toBe(false);
    expect(includeExistingStayInCombinedKey('הוראה ללא שהייה', 'גנים')).toBe(false);
  });
  it('פרא: רק בגנים', () => {
    expect(includeExistingStayInCombinedKey('פרא', 'גנים')).toBe(true);
    expect(includeExistingStayInCombinedKey('פרא', 'יסודי')).toBe(false);
    expect(includeExistingStayInCombinedKey('פרא', 'חטיבה')).toBe(false);
  });
});

describe('computeUtilizedHours', () => {
  it('sums frontal + individual, without stay, outside גנים', () => {
    expect(computeUtilizedHours('יסודי', { frontalHours: 10, individualHours: 5, stayHoursInstitution: 3, stayHoursHome: 2 })).toBe(15);
  });
  it('includes stay hours for גנים', () => {
    expect(computeUtilizedHours('גנים', { frontalHours: 10, individualHours: 5, stayHoursInstitution: 3, stayHoursHome: 2 })).toBe(20);
  });
  it('falls back to weeklyHours when there is no ofek breakdown (e.g. "רגיל")', () => {
    expect(computeUtilizedHours('יסודי', { weeklyHours: 25 })).toBe(25);
  });

  it('subtracts the biweekly deduction from the ofek breakdown', () => {
    expect(
      computeUtilizedHours('גנים', {
        frontalHours: 10,
        individualHours: 5,
        stayHoursInstitution: 3,
        stayHoursHome: 2,
        biweeklyDeductionHours: 4,
      }),
    ).toBe(16);
  });
  it('subtracts the biweekly deduction from the weeklyHours fallback (non-ofek types)', () => {
    expect(computeUtilizedHours('יסודי', { weeklyHours: 25, biweeklyDeductionHours: 3 })).toBe(22);
  });
  it('never goes below 0', () => {
    expect(computeUtilizedHours('יסודי', { weeklyHours: 5, biweeklyDeductionHours: 10 })).toBe(0);
  });
  it('ignores an absent biweekly deduction', () => {
    expect(computeUtilizedHours('יסודי', { weeklyHours: 25 })).toBe(25);
  });
  it('excludes stay for הוראה ללא שהייה even in גנים', () => {
    expect(
      computeUtilizedHours(
        'גנים',
        { frontalHours: 10, individualHours: 5, stayHoursInstitution: 3, stayHoursHome: 2 },
        'הוראה ללא שהייה',
      ),
    ).toBe(15);
  });
});
