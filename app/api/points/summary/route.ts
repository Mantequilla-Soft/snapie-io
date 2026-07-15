import { NextRequest, NextResponse } from 'next/server';
import { getPointsSummary } from '@/lib/points/awardService';

// Public read — a points balance is a public stat, like a follower count.
export async function GET(req: NextRequest) {
  const username = new URL(req.url).searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'username_required' }, { status: 400 });
  }
  const summary = await getPointsSummary(username.toLowerCase());
  return NextResponse.json(summary);
}
