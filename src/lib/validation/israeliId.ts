/**
 * Israeli national ID (ת.ז.) validation via the standard checksum (Luhn-like).
 * Pads to 9 digits. Returns true only for a valid checksum.
 */
export function isValidIsraeliId(input: string): boolean {
  const digits = String(input).trim();
  if (!/^\d{1,9}$/.test(digits)) return false;
  const id = digits.padStart(9, '0');

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(id[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** Normalize an ID to 9 digits (zero-padded). Returns null if not numeric. */
export function normalizeIsraeliId(input: string): string | null {
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 9) return null;
  return digits.padStart(9, '0');
}
