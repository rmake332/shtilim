import { describe, it, expect } from 'vitest';
import {
  isMotherPosition,
  jobPercent,
  buildOfekKey,
  severeDisabilityBonus,
  paraStaySplit,
  paraDailyUnits,
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

describe('severeDisabilityBonus', () => {
  const base = {
    severeDisabilityFlag: true,
    paraBoard: false,
    isBehaviorAnalyst: false,
    finalLayer: 'יסודי',
    enteredHours: 10,
  };
  it('0 when flag off', () => {
    expect(severeDisabilityBonus({ ...base, severeDisabilityFlag: false })).toBe(0);
  });
  it('+1 under 15h, eligible', () => {
    expect(severeDisabilityBonus({ ...base, enteredHours: 10 })).toBe(1);
  });
  it('+2 at/over 15h, eligible', () => {
    expect(severeDisabilityBonus({ ...base, enteredHours: 15 })).toBe(2);
  });
  it('0 when behaviorAnalyst + paraBoard', () => {
    expect(severeDisabilityBonus({ ...base, isBehaviorAnalyst: true, paraBoard: true })).toBe(0);
  });
  it('0 when paraBoard on', () => {
    expect(severeDisabilityBonus({ ...base, paraBoard: true })).toBe(0);
  });
  it('0 when layer not יסודי/גנים', () => {
    expect(severeDisabilityBonus({ ...base, finalLayer: 'חטיבה' })).toBe(0);
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
