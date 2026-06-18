import { NextRequest, NextResponse } from 'next/server';
import { resolveInstitutionByToken } from '@/lib/institution';

/**
 * GET /api/institutions/verify?token=...&mosadId=...
 * מאמת שהטוקן שייך למוסד הספציפי.
 * מחזיר 200 אם תקין, 401 אם לא.
 */
export async function GET(req: NextRequest) {
  const token   = req.nextUrl.searchParams.get('token')   ?? '';
  const mosadId = req.nextUrl.searchParams.get('mosadId') ?? '';

  const institution = await resolveInstitutionByToken(token);
  if (!institution) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, name: institution.name });
}
