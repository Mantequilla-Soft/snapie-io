import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/points/awardService';

// Public read — the leaderboard is a public stat.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const limitParam = parseInt(params.get('limit') ?? '', 10);
  const offsetParam = parseInt(params.get('offset') ?? '', 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 50;
  const offset = Number.isFinite(offsetParam) ? offsetParam : 0;
  const page = await getLeaderboard(limit, offset);
  return NextResponse.json(page);
}
