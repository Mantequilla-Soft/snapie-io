'use client';
import { authenticatedFetch, POINTS_SPENT_EVENT, PointsSpentDetail } from '@/lib/points/client';
import { SpinStatus } from '@/lib/points/rouletteService';
import { RouletteMultiplier } from '@/lib/points/rouletteConfig';

export interface SpinClientResult {
  status: SpinStatus;
  multiplier: RouletteMultiplier | null;
  payout: number;
  netDelta: number;
  balance: number;
}

/** Spends `stake` points on one roulette spin. spinId is generated fresh per
 *  call via crypto.randomUUID() — the server's unique-index idempotency
 *  guard (see rouletteService.spinRoulette) is what makes a page reload and
 *  resubmit safe, this doesn't need to track or reuse ids itself.
 *
 *  Dispatches POINTS_SPENT_EVENT only on a real 'spun' result — that's the
 *  only status where a balance change actually happened. usePointsSummary's
 *  handler just sets `balance` from the event and never touches
 *  lifetimeEarned, which is exactly right here: a jackpot must never move
 *  the leaderboard, same invariant the backend already enforces. */
export async function spinRoulette(username: string, stake: number): Promise<SpinClientResult> {
  const spinId = crypto.randomUUID();
  const res = await authenticatedFetch(username, '/api/points/roulette/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spinId, stake }),
  });
  if (!res) throw new Error('Could not start a session to spin. Please try again.');
  if (!res.ok) throw new Error('Could not complete this spin. Please try again.');

  const data = (await res.json()) as SpinClientResult;
  if (data.status === 'spun') {
    window.dispatchEvent(
      new CustomEvent<PointsSpentDetail>(POINTS_SPENT_EVENT, { detail: { spent: stake, balance: data.balance } }),
    );
  }
  return data;
}
