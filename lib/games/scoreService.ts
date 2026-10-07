import { connectDB } from '@/lib/db/mongodb';
import { GameScore } from '@/lib/db/models/GameScore';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import {
  GAME_AWARD_MODE,
  GAME_FLAT_WIN_POINTS,
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
 *
 * Flat-win games (Snapie Blocks) do not use this function. A client posting
 * `won: true` here is rejected — the match document settles the winner and
 * `awardFlatWin` credits the flat amount once.
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

  if (GAME_AWARD_MODE[typedGameId] === 'flat-win') {
    return { status: 'invalid_score', pointsAwarded: 0, balance: await currentBalance(username) };
  }

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

  const pointsAwarded = Math.floor((score * GAME_POINTS_CONVERSION_RATE_PCT[typedGameId]) / 100);
  return claimAndCredit({
    username,
    gameId: typedGameId,
    sessionId,
    score,
    stage,
    stagesCleared,
    won,
    durationMs,
    clientEndedAt,
    pointsAwarded,
  });
}

const MATCH_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

/**
 * Credits the flat win amount for a PvP game. Callers must already know the
 * player won — this does not look at a client `won` flag. Idempotent on
 * `win:<matchId>`: a second call returns the original award and does not
 * credit again. Guest ids are rejected.
 */
export async function awardFlatWin(
  username: string,
  gameId: string,
  matchId: string,
): Promise<SubmitScoreResult> {
  await connectDB();

  if (!username || username.startsWith('guest_')) {
    return { status: 'invalid_score', pointsAwarded: 0, balance: 0 };
  }
  if (!GAME_IDS.includes(gameId as GameId)) {
    return { status: 'unknown_game', pointsAwarded: 0, balance: await currentBalance(username) };
  }

  const typedGameId = gameId as GameId;
  const points = GAME_FLAT_WIN_POINTS[typedGameId];
  if (points == null || GAME_AWARD_MODE[typedGameId] !== 'flat-win' || !MATCH_ID_RE.test(matchId)) {
    return { status: 'invalid_score', pointsAwarded: 0, balance: await currentBalance(username) };
  }

  return claimAndCredit({
    username,
    gameId: typedGameId,
    sessionId: `win:${matchId}`,
    score: 0,
    stage: 1,
    stagesCleared: 1,
    won: true,
    durationMs: 0,
    clientEndedAt: Date.now(),
    pointsAwarded: points,
  });
}

interface ClaimInput {
  username: string;
  gameId: GameId;
  sessionId: string;
  score: number;
  stage: number;
  stagesCleared: number;
  won: boolean;
  durationMs: number;
  clientEndedAt: number;
  pointsAwarded: number;
}

/** Insert the GameScore row first, then credit. A crash between the two
 *  leaves an orphaned claim, never an orphaned credit. */
async function claimAndCredit(input: ClaimInput): Promise<SubmitScoreResult> {
  const { username, gameId, sessionId, pointsAwarded } = input;

  const existing = await GameScore.findOne({ username, gameId, sessionId }).lean();
  if (existing) {
    return {
      status: 'duplicate',
      pointsAwarded: existing.pointsAwarded,
      balance: await currentBalance(username),
    };
  }

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

  try {
    await GameScore.create({
      username,
      gameId,
      sessionId,
      score: input.score,
      stage: input.stage,
      stagesCleared: input.stagesCleared,
      won: input.won,
      durationMs: input.durationMs,
      clientEndedAt: new Date(input.clientEndedAt),
      pointsAwarded,
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      const dup = await GameScore.findOne({ username, gameId, sessionId }).lean();
      return {
        status: 'duplicate',
        pointsAwarded: dup?.pointsAwarded ?? 0,
        balance: await currentBalance(username),
      };
    }
    throw err;
  }

  const acct = await PointsAccount.findByIdAndUpdate(
    username,
    { $inc: { balance: pointsAwarded, lifetimeEarned: pointsAwarded }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  return { status: 'awarded', pointsAwarded, balance: acct?.balance ?? 0 };
}
