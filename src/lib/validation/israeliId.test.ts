import { describe, it, expect } from 'vitest';
import { isValidIsraeliId, normalizeIsraeliId } from './israeliId';

describe('isValidIsraeliId', () => {
  it('accepts valid IDs (with checksum)', () => {
    // Known-valid Israeli test IDs
    expect(isValidIsraeliId('000000018')).toBe(true);
    expect(isValidIsraeliId('123456782')).toBe(true);
  });

  it('pads short numeric IDs before checking', () => {
    expect(isValidIsraeliId('18')).toBe(true); // → 000000018
  });

  it('rejects invalid checksums', () => {
    expect(isValidIsraeliId('123456789')).toBe(false);
    expect(isValidIsraeliId('000000019')).toBe(false);
  });

  it('rejects non-numeric or too-long input', () => {
    expect(isValidIsraeliId('abc')).toBe(false);
    expect(isValidIsraeliId('1234567890')).toBe(false);
    expect(isValidIsraeliId('')).toBe(false);
  });
});

describe('normalizeIsraeliId', () => {
  it('pads to 9 digits', () => {
    expect(normalizeIsraeliId('18')).toBe('000000018');
    expect(normalizeIsraeliId('123456782')).toBe('123456782');
  });

  it('strips non-digits', () => {
    expect(normalizeIsraeliId('12-34')).toBe('000001234');
  });

  it('returns null for empty or too long', () => {
    expect(normalizeIsraeliId('')).toBeNull();
    expect(normalizeIsraeliId('1234567890')).toBeNull();
  });
});
