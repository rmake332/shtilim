import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * כניסת מנהל: סיסמה אחת מ-ADMIN_PASSWORD, וסשן בעוגייה חתומה (HMAC) בלי מצב בשרת.
 * זה ממשק נפרד לגמרי מטוקן המוסד (gateByToken) - המנהל רואה את כל המוסדות, ולכן
 * כל route תחת /api/admin חייב לעבור דרך gateAdmin.
 */

export const ADMIN_COOKIE = 'admin_session';
/** תוקף הסשן: 12 שעות. */
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

function secret(): string {
  return process.env.ADMIN_PASSWORD || '';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** בדיקת סיסמה בזמן קבוע. false תמיד כשלא הוגדרה ADMIN_PASSWORD. */
export function adminPasswordOk(provided: string): boolean {
  const expected = secret();
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

/** ערך עוגייה חדש: "<expiry>.<hmac>". */
export function createAdminSession(): string {
  const exp = String(Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS);
  return `${exp}.${sign(exp)}`;
}

export function isValidAdminSession(value: string | undefined): boolean {
  if (!value || !secret()) return false;
  const [exp, mac] = value.split('.');
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(mac, sign(exp));
}

/** שער לכל route של מנהל: מחזיר requestId, או 401. */
export function gateAdmin(req: NextRequest): { requestId: string } | NextResponse {
  const requestId = randomUUID();
  if (!isValidAdminSession(req.cookies.get(ADMIN_COOKIE)?.value)) {
    logger.warn({ requestId }, 'admin request rejected: no valid session');
    return NextResponse.json({ ok: false, message: 'נדרשת כניסת מנהל.' }, { status: 401 });
  }
  return { requestId };
}
