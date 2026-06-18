/** Client-safe ת.ז. masking (last 4 digits). Mirrors maskTz in logger.ts without server deps. */
export function maskTzClient(tz: string | undefined | null): string {
  if (!tz) return '';
  const digits = String(tz).replace(/\D/g, '');
  if (digits.length <= 4) return '●'.repeat(digits.length);
  return '●'.repeat(digits.length - 4) + digits.slice(-4);
}
