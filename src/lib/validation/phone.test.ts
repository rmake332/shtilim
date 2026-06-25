import { describe, it, expect } from 'vitest';
import { isValidIsraeliPhone } from './phone';

describe('isValidIsraeliPhone', () => {
  it('accepts mobile numbers (05X)', () => {
    expect(isValidIsraeliPhone('0501234567')).toBe(true);
    expect(isValidIsraeliPhone('052-9876543')).toBe(true);
    expect(isValidIsraeliPhone('054 123 4567')).toBe(true);
  });

  it('accepts landline numbers (area code)', () => {
    expect(isValidIsraeliPhone('02-1234567')).toBe(true);
    expect(isValidIsraeliPhone('039876543')).toBe(true);
  });

  it('accepts VoIP/national numbers (07X)', () => {
    expect(isValidIsraeliPhone('077-1234567')).toBe(true);
  });

  it('rejects empty / too short / too long', () => {
    expect(isValidIsraeliPhone('')).toBe(false);
    expect(isValidIsraeliPhone('050123')).toBe(false);
    expect(isValidIsraeliPhone('05012345678')).toBe(false);
  });

  it('rejects numbers not starting with a valid prefix', () => {
    expect(isValidIsraeliPhone('1234567890')).toBe(false);
    expect(isValidIsraeliPhone('0612345678')).toBe(false);
  });
});
