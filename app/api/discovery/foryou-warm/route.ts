import { NextRequest, NextResponse } from 'next/server';
import { fetchWarmForYouCandidates } from '@/lib/discovery/forYouWarm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_LIMIT = 25;

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : 10;

  const requestedOffset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const tagsParam = request.nextUrl.searchParams.get('tags') ?? '';
  const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);

  const username = request.nextUrl.searchParams.get('username') || undefined;

  try {
    if (tags.length === 0) {
      // No interest signal — nothing to match against, and the caller
      // should be using the cold-start pool instead. Same empty-but-200
      // contract as every other discovery route rather than a 400, so a
      // caller in a bad state degrades quietly instead of erroring.
      return NextResponse.json({ items: [], hasMore: false }, { status: 200 });
    }
    const { items, hasMore } = await fetchWarmForYouCandidates(tags, limit, offset, username);
    return NextResponse.json({ items, hasMore }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ items: [], hasMore: false }, { status: 200 });
  }
}
