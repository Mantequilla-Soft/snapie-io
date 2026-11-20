'use client';
import { authenticatedFetch, POINTS_EARNED_EVENT, PointsEarnedDetail } from '@/lib/points/client';
import { SubmitScoreStatus } from '@/lib/games/scoreService';
import type { GameId } from '@/lib/games/config';

export interface SaveScoreClientResult {
  status: SubmitScoreStatus;
  pointsAwarded: number;
  balance: number;
}

/**
 * Submits a game score and saves it to the database, awarding Snapie Points.
 * Dispatches POINTS_EARNED_EVENT on success so the global PointsToaster and
 * usePointsSummary hooks react automatically.
 */
export async function saveGameScore(
  username: string,
  gameId: GameId,
  result: {
    sessionId?: string;
    score: number;
    stage: number;
    stagesCleared: number;
    won: boolean;
    durationMs: number;
    endedAt: number;
  },
  ticket?: string | null,
): Promise<SaveScoreClientResult> {
  if (!result.sessionId) {
    throw new Error('Game result missing sessionId');
  }

  const res = await authenticatedFetch(username, `/api/games/${gameId}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: result.sessionId,
      score: result.score,
      stage: result.stage,
      stagesCleared: result.stagesCleared,
      won: result.won,
      durationMs: result.durationMs,
      endedAt: result.endedAt,
      ticket: ticket ?? undefined,
    }),
  });
  if (!res) throw new Error('Could not start a session to save this score. Please try again.');
  if (res.status === 403) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    if (err?.error === 'invalid_ticket') {
      throw new Error('This run could not be verified, so its score was not saved. Play again to save a new score.');
    }
  }
  if (!res.ok) throw new Error('Could not save this score. Please try again.');

  const data = (await res.json()) as SaveScoreClientResult;
  if (data.status === 'awarded' && data.pointsAwarded > 0) {
    window.dispatchEvent(
      new CustomEvent<PointsEarnedDetail>(POINTS_EARNED_EVENT, {
        detail: { awarded: data.pointsAwarded, balance: data.balance },
      }),
    );
  }
  return data;
}

/**
 * Asks the server to sign the start of a run (lib/games/sessionTicket.ts).
 * Silent: it never opens a wallet prompt when a run starts. Returns null when
 * no session token is available or the request fails; the save then reports
 * the run as unverified.
 */
export async function requestGameTicket(username: string, gameId: GameId, sessionId: string): Promise<string | null> {
  try {
    const res = await authenticatedFetch(username, `/api/games/${gameId}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }, { silent: true });
    if (!res?.ok) return null;
    const data = (await res.json()) as { ticket?: unknown };
    return typeof data.ticket === 'string' ? data.ticket : null;
  } catch {
    return null;
  }
}
