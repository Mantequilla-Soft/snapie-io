import { NextResponse } from 'next/server';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(`${SIDECAR_URL}/patrons`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ patrons: [] }, { status: 200 });
    const data = await res.json();
    // Patron status changes rarely (a delegation sync or a monthly transfer) —
    // same cacheable pattern as /api/trending-authors.
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({ patrons: [] }, { status: 200 });
  }
}
