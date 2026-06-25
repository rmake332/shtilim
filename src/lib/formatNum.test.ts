import { describe, it, expect } from 'vitest';
import { formatNum } from './formatNum';

describe('formatNum', () => {
  it('מספר שלם — ללא נקודה', () => {
    expect(formatNum(35)).toBe('35');
    expect(formatNum(0)).toBe('0');
    expect(formatNum(35.0)).toBe('35');
  });

  it('ספרה אחת אחרי הנקודה', () => {
    expect(formatNum(35.5)).toBe('35.5');
    expect(formatNum(35.1)).toBe('35.1');
    expect(formatNum(0.5)).toBe('0.5');
  });

  it('שתי ספרות אחרי הנקודה', () => {
    expect(formatNum(35.55)).toBe('35.55');
    expect(formatNum(35.05)).toBe('35.05');
  });

  it('שלוש ספרות ומעלה — מעוגל ל-2 (כמו toFixed)', () => {
    expect(formatNum(35.556)).toBe('35.56');
    expect(formatNum(35.554)).toBe('35.55');
    expect(formatNum(35.999)).toBe('36');
    expect(formatNum(35.501)).toBe('35.5');
  });

  it('מספרים שליליים', () => {
    expect(formatNum(-12.5)).toBe('-12.5');
    expect(formatNum(-12)).toBe('-12');
  });
});
