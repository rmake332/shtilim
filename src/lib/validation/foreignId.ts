import { isPlaceholderId } from '@/lib/validation/placeholderId';

/**
 * Foreign ID / passport number, for employees without an Israeli תעודת זהות.
 * No checksum (foreign IDs have none) - just sane length/character bounds.
 *
 * ממלאי מקום נפסלים גם כאן, אחרת תיבת "ללא ת.ז. ישראלית" הייתה דלת אחורית
 * להקלדת 000000000 אחרי שנחסם במסלול הישראלי.
 */
export function isValidForeignId(input: string): boolean {
  const cleaned = String(input).trim().replace(/[\s-]/g, '');
  if (isPlaceholderId(cleaned)) return false;
  return /^[A-Za-z0-9]{4,20}$/.test(cleaned);
}

/**
 * Normalize a foreign ID for exact-match comparisons: trim, uppercase, drop internal
 * spaces/dashes. Unlike normalizeIsraeliId, NEVER strips letters or digits - stripping
 * letters would let two different foreign IDs sharing a digit run (e.g. "AB1234567" vs
 * "CD1234567") collide. Returns null for empty input.
 */
export function normalizeForeignId(input: string): string | null {
  const cleaned = String(input).trim().replace(/[\s-]/g, '').toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}
