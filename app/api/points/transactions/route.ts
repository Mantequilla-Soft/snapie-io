import { NextRequest, NextResponse } from 'next/server';
import { getRecentTransactions } from '@/lib/points/transactionHistory';

// Public read — same precedent as summary/leaderboard: points balance/rank
// are already public in this app, so per-event history is no more sensitive.
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const username = params.get('username');
  if (!username) {
    return NextResponse.json({ error: 'username_required' }, { status: 400 });
  }
  const limitParam = parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : 10;

  const transactions = await getRecentTransactions(username.toLowerCase(), limit);
  return NextResponse.json({ transactions });
}
