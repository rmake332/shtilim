/**
 * Israeli phone-number validation.
 * Accepts mobile and landline numbers, with or without separators (-, spaces).
 * Mobile:   05X-XXXXXXX (10 digits, starts 05)
 * Landline: 0X-XXXXXXX  (9 digits, area code 02/03/04/08/09/077/072/073/076/074)
 */
export function isValidIsraeliPhone(value: string): boolean {
  const digits = String(value ?? '').replace(/\D/g, '');
  // Mobile: 10 digits starting with 05.
  if (/^05\d{8}$/.test(digits)) return true;
  // Landline: 9 digits, area codes 02/03/04/08/09.
  if (/^0[23489]\d{7}$/.test(digits)) return true;
  // VoIP / national: 07X — 10 digits starting with 07.
  if (/^07\d{8}$/.test(digits)) return true;
  return false;
}
