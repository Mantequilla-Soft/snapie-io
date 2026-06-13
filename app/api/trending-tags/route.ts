import { NextResponse } from 'next/server';
import HiveClient from '@/lib/hive/hiveclient';

export const revalidate = 300; // cache 5 minutes

export async function GET() {
  try {
    const result = await HiveClient.database.call('get_trending_tags', ['', 30]);

    return NextResponse.json(result ?? [], {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
