import { NextRequest, NextResponse } from 'next/server';
import { getBadgesForUser } from '@/lib/hive/accountBadges';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params;

  if (!username) {
    return NextResponse.json({ badges: [] }, { status: 200 });
  }

  try {
    const badges = await getBadgesForUser(username);
    return NextResponse.json(
      { badges },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json({ badges: [] }, { status: 200 });
  }
}
