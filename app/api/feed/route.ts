import { NextRequest, NextResponse } from 'next/server';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const before = request.nextUrl.searchParams.get('before');
  const limit = request.nextUrl.searchParams.get('limit') ?? '20';

  try {
    const qs = new URLSearchParams({ limit });
    if (before) qs.set('before', before);
    const res = await fetch(`${SIDECAR_URL}/feed?${qs.toString()}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ items: [], hasMore: false }, { status: 200 });
    const data = await res.json();
    // Response varies per `before` cursor — never cache, same rule as /api/new-snaps.
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ items: [], hasMore: false }, { status: 200 });
  }
}
