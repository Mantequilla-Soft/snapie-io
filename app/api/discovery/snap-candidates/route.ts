import { NextRequest, NextResponse } from 'next/server';
import { fetchTrendingSnapCandidates } from '@/lib/discovery/snapTrending';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_LIMIT = 25;

export async function GET(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : 10;

  const requestedOffset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const username = request.nextUrl.searchParams.get('username') || undefined;

  try {
    const { items, hasMore } = await fetchTrendingSnapCandidates(limit, offset, username);
    return NextResponse.json({ items, hasMore }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ items: [], hasMore: false }, { status: 200 });
  }
}
