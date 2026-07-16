import { connectDB } from '@/lib/db/mongodb';
import { PointsLedger } from '@/lib/db/models/PointsLedger';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import { POINTS, DAILY_CAP, PointsActionType } from '@/lib/points/constants';
import { verifyAction } from '@/lib/points/hiveVerify';

export type AwardStatus = 'awarded' | 'duplicate' | 'capped' | 'self' | 'unverified';

export interface AwardResult {
  status: AwardStatus;
  awarded: number;
  balance: number;
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function currentBalance(username: string): Promise<number> {
  const acct = await PointsAccount.findById(username).lean();
  return acct?.balance ?? 0;
}

/** Awards points for a completed, on-chain-verified action. Idempotent by
 *  (username, actionType, refKey). Returns a status describing what happened so
 *  the caller can decide whether to surface anything (only 'awarded' should). */
export async function awardForAction(
  username: string,
  actionType: PointsActionType,
  author: string,
  permlink: string,
): Promise<AwardResult> {
  await connectDB();
  const refKey = `${author}/${permlink}`;

  // Cheap idempotency pre-check (the unique index is the real guarantee below).
  const existing = await PointsLedger.findOne({ username, actionType, refKey }).lean();
  if (existing) return { status: 'duplicate', awarded: 0, balance: await currentBalance(username) };

  // Daily cap for the cheap/loosely-attributed actions.
  const cap = DAILY_CAP[actionType];
  if (cap != null) {
    const todayCount = await PointsLedger.countDocuments({
      username,
      actionType,
      createdAt: { $gte: startOfUtcDay() },
    });
    if (todayCount >= cap) return { status: 'capped', awarded: 0, balance: await currentBalance(username) };
  }

  // On-chain verification + self-dealing rule (bounded retry inside).
  const outcome = await verifyAction(actionType, username, author, permlink);
  if (outcome === 'self') return { status: 'self', awarded: 0, balance: await currentBalance(username) };
  if (outcome !== 'ok') return { status: 'unverified', awarded: 0, balance: await currentBalance(username) };

  const points = POINTS[actionType];
  try {
    await PointsLedger.create({ username, actionType, points, refKey });
  } catch (err: unknown) {
    // Lost an idempotency race — someone/something already awarded this.
    if ((err as { code?: number })?.code === 11000) {
      return { status: 'duplicate', awarded: 0, balance: await currentBalance(username) };
    }
    throw err;
  }

  const acct = await PointsAccount.findByIdAndUpdate(
    username,
    { $inc: { balance: points, lifetimeEarned: points }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  return { status: 'awarded', awarded: points, balance: acct?.balance ?? points };
}

export interface PointsSummary {
  username: string;
  balance: number;
  lifetimeEarned: number;
  /** Leaderboard position by lifetimeEarned. null if the user has never
   *  earned anything (matches getLeaderboard's $gt: 0 exclusion — there's no
   *  rank to hold among people who haven't earned). Ties share a rank (dense
   *  by "how many people rank strictly above you," not by row order). */
  rank: number | null;
}

export async function getPointsSummary(username: string): Promise<PointsSummary> {
  await connectDB();
  const acct = await PointsAccount.findById(username).lean();
  const lifetimeEarned = acct?.lifetimeEarned ?? 0;
  const rank =
    lifetimeEarned > 0
      ? (await PointsAccount.countDocuments({ lifetimeEarned: { $gt: lifetimeEarned } })) + 1
      : null;
  return {
    username,
    balance: acct?.balance ?? 0,
    lifetimeEarned,
    rank,
  };
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  lifetimeEarned: number;
  balance: number;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  hasMore: boolean;
}

const LEADERBOARD_PAGE_SIZE_MAX = 100;

/** Top earners, ranked by all-time earnings (spending never demotes you),
 *  one page at a time. `offset` is a plain row count, not a cursor — fine at
 *  leaderboard scale (thousands of rows, not millions) and it's what lets
 *  `rank` be computed as `offset + index + 1` without an extra query. Caps
 *  page size at 100 regardless of what's requested, so a caller can't force
 *  an unbounded single-page fetch. */
export async function getLeaderboard(limit = 50, offset = 0): Promise<LeaderboardPage> {
  await connectDB();
  const pageSize = Math.min(Math.max(limit, 1), LEADERBOARD_PAGE_SIZE_MAX);
  const safeOffset = Math.max(offset, 0);
  // Fetch one extra row to learn whether another page exists without a
  // separate countDocuments query.
  const rows = await PointsAccount.find({ lifetimeEarned: { $gt: 0 } })
    .sort({ lifetimeEarned: -1 })
    .skip(safeOffset)
    .limit(pageSize + 1)
    .lean();
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  return {
    entries: page.map((r, i) => ({
      rank: safeOffset + i + 1,
      username: String(r._id),
      lifetimeEarned: r.lifetimeEarned ?? 0,
      balance: r.balance ?? 0,
    })),
    hasMore,
  };
}
