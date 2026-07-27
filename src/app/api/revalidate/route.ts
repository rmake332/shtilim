import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { randomUUID, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';
import { ALL_CACHE_TAGS, tagsForTable, type CacheTag } from '@/lib/cacheTags';

/**
 * POST|GET /api/revalidate
 *
 * Drops the Next data-cache entries that hold Airtable reads, so an edit made in
 * Airtable shows up in the form within seconds instead of waiting out the TTL.
 * Meant to be called by an Airtable automation ("When record updated" → Send request).
 *
 * Auth: shared secret in the `x-revalidate-secret` header, the `secret` query param,
 * or the JSON body. Not the institution token — this is an admin/ops endpoint.
 *
 * Scope: `table` (an Airtable tblXXXX id or a friendly key: budget | symbols |
 * prev-year | choices) or an explicit `tags` array. Neither → flush everything.
 */

export const dynamic = 'force-dynamic';

/** Constant-time compare so the secret can't be probed byte by byte. */
function secretOk(provided: string): boolean {
  const expected = process.env.REVALIDATE_SECRET || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Body {
  secret?: string;
  table?: string;
  tags?: string[];
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  let body: Body = {};
  if (req.method === 'POST') {
    body = (await req.json().catch(() => ({}))) as Body;
  }

  const provided =
    req.headers.get('x-revalidate-secret') ??
    req.nextUrl.searchParams.get('secret') ??
    body.secret ??
    '';

  if (!process.env.REVALIDATE_SECRET) {
    logger.error({ requestId }, 'revalidate: REVALIDATE_SECRET not set');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }
  if (!secretOk(provided)) {
    logger.warn({ requestId }, 'revalidate rejected: bad secret');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const explicit = body.tags ?? req.nextUrl.searchParams.getAll('tag');
  const table = body.table ?? req.nextUrl.searchParams.get('table');

  // An explicit tags list wins; unknown tag names are dropped rather than guessed at.
  const tags: CacheTag[] = explicit.length
    ? ALL_CACHE_TAGS.filter((t) => explicit.includes(t))
    : tagsForTable(table);

  tags.forEach((t) => revalidateTag(t));
  logger.info({ requestId, table, tags }, 'cache revalidated');

  return NextResponse.json({ revalidated: tags, at: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
