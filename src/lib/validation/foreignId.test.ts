import { describe, it, expect } from 'vitest';
import { isValidForeignId, normalizeForeignId } from './foreignId';

describe('isValidForeignId', () => {
  it('accepts 4-20 char alphanumeric, with internal dash/space', () => {
    expect(isValidForeignId('AB1234567')).toBe(true);
    expect(isValidForeignId('AB 123-4567')).toBe(true);
    expect(isValidForeignId('1234')).toBe(true);
  });

  it('rejects empty, too short, too long, or symbol-only input', () => {
    expect(isValidForeignId('')).toBe(false);
    expect(isValidForeignId('AB1')).toBe(false);
    expect(isValidForeignId('A'.repeat(21))).toBe(false);
    expect(isValidForeignId('---')).toBe(false);
  });
});

describe('normalizeForeignId', () => {
  it('uppercases and strips separators, preserving letters and digits', () => {
    expect(normalizeForeignId('ab 123-4567')).toBe('AB1234567');
  });

  it('returns null for empty input', () => {
    expect(normalizeForeignId('')).toBeNull();
    expect(normalizeForeignId('   ')).toBeNull();
  });

  it('does not collide two different IDs sharing a digit run (regression)', () => {
    expect(normalizeForeignId('AB1234567')).not.toBe(normalizeForeignId('CD1234567'));
  });
});
