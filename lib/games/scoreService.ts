import { connectDB } from '@/lib/db/mongodb';
import { GameScore } from '@/lib/db/models/GameScore';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import {
  GAME_IDS,
  GAME_POINTS_CONVERSION_RATE_PCT,
  GAME_MAX_SCORE,
  GAMES_DAILY_POINTS_CAP,
  type GameId,
} from '@/lib/games/config';
import { currentBalance } from '@/lib/points/accountUtils';

export type SubmitScoreStatus = 'awarded' | 'duplicate' | 'invalid_score' | 'unknown_game' | 'capped';

export interface SubmitScoreResult {
  status: SubmitScoreStatus;
  pointsAwarded: number;
  balance: number;
}

/**
 * Submits a game score and awards Snapie Points, following the claim-then-charge
 * pattern (insert the GameScore row first as the idempotency gate, then increment
 * PointsAccount). Implements daily-cap enforcement and deduplication via unique
 * sessionId index.
 *
 * v1 anti-cheat is: per-game max score cap + daily points cap + idempotent
 * sessionId dedup. Replay validation is deferred to a future iteration.
 */
export async function submitGameScore(
  username: string,
  gameId: string,
  sessionId: string,
  score: number,
  stage: number,
  stagesCleared: number,
  won: boolean,
  durationMs: number,
  clientEndedAt: number,
): Promise<SubmitScoreResult> {
  await connectDB();

  // Check if gameId is valid.
  if (!GAME_IDS.includes(gameId as GameId)) {
    return { status: 'unknown_game', pointsAwarded: 0, balance: await currentBalance(username) };
  }

  const typedGameId = gameId as GameId;

  // Validate input types and bounds.
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > GAME_MAX_SCORE[typedGameId] ||
    !Number.isInteger(stage) ||
    stage < 1 ||
    !Number.isInteger(stagesCleared) ||
    stagesCleared < 0 ||
    typeof won !== 'boolean' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  ) {
    return { status: 'invalid_score', pointsAwarded: 0, balance: await currentBalance(username) };
  }

  // Cheap idempotency pre-check (the unique index on the claim insert below
  // is the real guarantee).
  const existing = await GameScore.findOne({ username, gameId: typedGameId, sessionId }).lean();
  if (existing) {
    return {
      status: 'duplicate',
      pointsAwarded: existing.pointsAwarded,
      balance: await currentBalance(username),
    };
  }

  // Compute the award.
  const pointsAwarded = Math.floor((score * GAME_POINTS_CONVERSION_RATE_PCT[typedGameId]) / 100);

  // Daily-cap check: sum today's pointsAwarded for this user across all games.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todaySum = await GameScore.aggregate([
    {
      $match: {
        username,
        createdAt: { $gte: today },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$pointsAwarded' },
      },
    },
  ]);
  const currentDaily = todaySum.length > 0 ? todaySum[0].total : 0;

  if (currentDaily + pointsAwarded > GAMES_DAILY_POINTS_CAP) {
    return { status: 'capped', pointsAwarded: 0, balance: await currentBalance(username) };
  }

  // Claim phase: insert the GameScore row. The unique index is the idempotency gate.
  try {
    await GameScore.create({
      username,
      gameId: typedGameId,
      sessionId,
      score,
      stage,
      stagesCleared,
      won,
      durationMs,
      clientEndedAt: new Date(clientEndedAt),
      pointsAwarded,
    });
  } catch (err: unknown) {
    // Lost an idempotency race — someone/something already claimed this sessionId.
    // Return its already-settled result rather than trying again.
    if ((err as { code?: number })?.code === 11000) {
      const dup = await GameScore.findOne({ username, gameId: typedGameId, sessionId }).lean();
      return {
        status: 'duplicate',
        pointsAwarded: dup?.pointsAwarded ?? 0,
        balance: await currentBalance(username),
      };
    }
    throw err;
  }

  // Charge phase: award the points. Must run after step above (claim first, credit
  // second) so a crash between them leaves an orphaned claim, never an orphaned credit.
  const acct = await PointsAccount.findByIdAndUpdate(
    username,
    { $inc: { balance: pointsAwarded, lifetimeEarned: pointsAwarded }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  return { status: 'awarded', pointsAwarded, balance: acct?.balance ?? 0 };
}
