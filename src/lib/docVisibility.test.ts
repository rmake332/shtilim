import { describe, it, expect } from 'vitest';
import { ageFromBirthDate, isDocVisible, isUnder16, isYouthHoursAge } from './formTypes';

// Birth date (Jan 1) for a target completed age — birthday already passed this year.
const birthForAge = (completedAge: number) => {
  const now = new Date();
  return `${now.getFullYear() - completedAge}-01-01`;
};

// Fixed reference date for deterministic age math.
const REF = new Date(2026, 5, 17); // 2026-06-17

describe('ageFromBirthDate', () => {
  it('returns null for empty / malformed input', () => {
    expect(ageFromBirthDate('', REF)).toBeNull();
    expect(ageFromBirthDate('not-a-date', REF)).toBeNull();
    expect(ageFromBirthDate('2010-13-40', REF)).toBeNull();
  });

  it('computes completed years, accounting for the birthday this year', () => {
    expect(ageFromBirthDate('2010-06-17', REF)).toBe(16); // birthday today
    expect(ageFromBirthDate('2010-06-18', REF)).toBe(15); // birthday tomorrow → not yet 16
    expect(ageFromBirthDate('2010-06-16', REF)).toBe(16); // birthday yesterday
  });
});

describe("isDocVisible — 'youth' (ages 15–17; >=15, <18)", () => {
  // isDocVisible('youth') uses the real "now" internally, so derive birth dates from
  // today's date and a target completed-age (Jan 1 → birthday already passed this year).
  const birthFor = (completedAge: number) => {
    const now = new Date();
    return `${now.getFullYear() - completedAge}-01-01`;
  };
  const ctx = (birthDate: string) => ({ birthDate });

  it('shows for completed ages 15, 16 and 17', () => {
    expect(isDocVisible('youth', ctx(birthFor(15)))).toBe(true);
    expect(isDocVisible('youth', ctx(birthFor(16)))).toBe(true);
    expect(isDocVisible('youth', ctx(birthFor(17)))).toBe(true);
  });

  it('hides below 15 and at/above 18', () => {
    expect(isDocVisible('youth', ctx(birthFor(14)))).toBe(false);
    expect(isDocVisible('youth', ctx(birthFor(18)))).toBe(false);
  });

  it('hides for clearly out-of-range ages and missing date', () => {
    expect(isDocVisible('youth', ctx(birthFor(36)))).toBe(false);
    expect(isDocVisible('youth', ctx(''))).toBe(false);
  });
});

describe('youth-employment warning thresholds', () => {
  it('isUnder16 — true below 16, false at/above 16', () => {
    expect(isUnder16(birthForAge(14))).toBe(true);
    expect(isUnder16(birthForAge(15))).toBe(true);
    expect(isUnder16(birthForAge(16))).toBe(false);
    expect(isUnder16(birthForAge(17))).toBe(false);
    expect(isUnder16('')).toBe(false);
  });

  it('isYouthHoursAge — true for 15, 16 and 17 (>=15, <18)', () => {
    expect(isYouthHoursAge(birthForAge(14))).toBe(false);
    expect(isYouthHoursAge(birthForAge(15))).toBe(true);
    expect(isYouthHoursAge(birthForAge(16))).toBe(true);
    expect(isYouthHoursAge(birthForAge(17))).toBe(true);
    expect(isYouthHoursAge(birthForAge(18))).toBe(false);
    expect(isYouthHoursAge('')).toBe(false);
  });
});

describe("isDocVisible — 'male'", () => {
  it('shows only for male', () => {
    expect(isDocVisible('male', { gender: 'זכר' })).toBe(true);
    expect(isDocVisible('male', { gender: 'נקבה' })).toBe(false);
    expect(isDocVisible('male', {})).toBe(false);
  });
});

describe("isDocVisible — 'kindergartenLayer'", () => {
  it('shows only for the גנים layer', () => {
    expect(isDocVisible('kindergartenLayer', { layer: 'גנים' })).toBe(true);
    expect(isDocVisible('kindergartenLayer', { layer: 'יסודי' })).toBe(false);
    expect(isDocVisible('kindergartenLayer', {})).toBe(false);
  });
});

describe('isDocVisible — menoExcluded (מעון institutions)', () => {
  it('hides a male-conditioned doc for מעון when menoExcluded is true', () => {
    expect(isDocVisible('male', { gender: 'זכר', layer: 'מעון' }, true)).toBe(false);
  });

  it('still shows a male-conditioned doc for non-מעון institutions when menoExcluded is true', () => {
    expect(isDocVisible('male', { gender: 'זכר', layer: 'יסודי' }, true)).toBe(true);
  });

  it('does not affect docs where menoExcluded is false/omitted', () => {
    expect(isDocVisible('male', { gender: 'זכר', layer: 'מעון' })).toBe(true);
    expect(isDocVisible('male', { gender: 'זכר', layer: 'מעון' }, false)).toBe(true);
  });
});
