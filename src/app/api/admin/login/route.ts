import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, adminPasswordOk, createAdminSession } from '@/lib/adminAuth';
import { logger } from '@/lib/logger';

/** POST /api/admin/login { password } - פותח סשן מנהל (עוגייה חתומה). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_PASSWORD) {
    logger.error({}, 'admin login attempted but ADMIN_PASSWORD is not set');
    return NextResponse.json({ ok: false, message: 'כניסת מנהל לא הוגדרה בשרת.' }, { status: 500 });
  }
  if (!adminPasswordOk(String(body.password || ''))) {
    return NextResponse.json({ ok: false, message: 'סיסמה שגויה.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return res;
}

/** DELETE /api/admin/login - יציאה. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
