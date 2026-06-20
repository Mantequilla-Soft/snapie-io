import { NextRequest, NextResponse } from 'next/server';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get('limit') ?? '20';

  try {
    const res = await fetch(`${SIDECAR_URL}/trending-authors?limit=${encodeURIComponent(limit)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ authors: [], warming: false }, { status: 200 });
    const data = await res.json();
    // Trending shifts slowly and doesn't vary per-request — same cacheable
    // pattern as /api/active-users (not /api/new-snaps, which is per-cursor).
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({ authors: [], warming: false }, { status: 200 });
  }
}
