import { NextRequest, NextResponse } from 'next/server';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const since = request.nextUrl.searchParams.get('since');
  if (!since) {
    return NextResponse.json({ error: 'since query param required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${SIDECAR_URL}/feed/new-since?since=${encodeURIComponent(since)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ count: 0, warming: false }, { status: 200 });
    const data = await res.json();
    // Response varies per `since` — never cache this route, same rule as /api/new-snaps.
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ count: 0, warming: false }, { status: 200 });
  }
}
