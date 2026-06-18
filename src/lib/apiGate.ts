import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { resolveInstitutionByToken, type Institution } from '@/lib/institution';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

/**
 * Resolve the institution from the request's token (query param or body).
 * Returns { institution, requestId } or a 401 NextResponse. Single IDOR gate for all routes.
 */
export async function gateByToken(
  req: NextRequest,
  tokenFromBody?: string,
): Promise<{ institution: Institution; requestId: string } | NextResponse> {
  const requestId = randomUUID();
  const token = tokenFromBody ?? req.nextUrl.searchParams.get('token') ?? '';
  const institution = await resolveInstitutionByToken(token, requestId);
  if (!institution) {
    logger.warn({ requestId }, 'request rejected: invalid token');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return { institution, requestId };
}
