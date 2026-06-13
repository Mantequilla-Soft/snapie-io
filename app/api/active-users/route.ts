import { NextResponse } from 'next/server';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(`${SIDECAR_URL}/active-users`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ count: null, warming: false }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json({ count: null, warming: false }, { status: 200 });
  }
}
