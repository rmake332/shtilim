import { NextRequest, NextResponse } from 'next/server';
import { searchEmployees } from '@/lib/employees';
import { resolveInstitutionByToken } from '@/lib/institution';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

/**
 * GET /api/employees/search?q=...&token=...
 * Token-gated employee search. Returns id + name + masked ID only.
 */
export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const token = req.nextUrl.searchParams.get('token') ?? '';

  // Gate by a valid institution token (defense-in-depth; search is sensitive).
  const institution = await resolveInstitutionByToken(token, requestId);
  if (!institution) {
    logger.warn({ requestId }, 'search rejected: invalid token');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ID-only search: require at least 4 digits.
  if (q.replace(/\D/g, '').length < 4) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchEmployees(q, requestId);
    return NextResponse.json({ results });
  } catch (e) {
    logger.error({ requestId, err: String(e) }, 'employee search failed');
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}
