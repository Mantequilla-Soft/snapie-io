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
}

export async function getPointsSummary(username: string): Promise<PointsSummary> {
  await connectDB();
  const acct = await PointsAccount.findById(username).lean();
  return {
    username,
    balance: acct?.balance ?? 0,
    lifetimeEarned: acct?.lifetimeEarned ?? 0,
  };
}
