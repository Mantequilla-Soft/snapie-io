import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/points/awardService';

// Public read — the leaderboard is a public stat.
export async function GET(req: NextRequest) {
  const limitParam = new URL(req.url).searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  const entries = await getLeaderboard(Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ entries });
}
