import pino from 'pino';

/**
 * Structured server-side logger with automatic PII redaction (Amendment 13).
 * Never log raw national IDs, names, addresses, emails, or PINs.
 */
const PII_PATHS = [
  'tz',
  'idNumber',
  'name',
  'fullName',
  'address',
  'email',
  'pin',
  'token',
  '*.tz',
  '*.idNumber',
  '*.name',
  '*.fullName',
  '*.address',
  '*.email',
  '*.pin',
  '*.token',
  'employee.tz',
  'employee.name',
  'employee.email',
  'employee.address',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: PII_PATHS,
    censor: '[redacted]',
  },
});

/** Mask an Israeli ID to last 4 digits for display/logging. */
export function maskTz(tz: string | undefined | null): string {
  if (!tz) return '';
  const digits = String(tz).replace(/\D/g, '');
  if (digits.length <= 4) return '●'.repeat(digits.length);
  return '●'.repeat(digits.length - 4) + digits.slice(-4);
}
