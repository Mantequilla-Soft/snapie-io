import { connectDB } from '@/lib/db/mongodb';
import { PointsLedger } from '@/lib/db/models/PointsLedger';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import { PointsGrant } from '@/lib/db/models/PointsGrant';
import { MAX_ADMIN_GRANT_POINTS } from '@/lib/points/constants';

export type GrantStatus = 'granted' | 'duplicate' | 'invalid_amount';

export interface GrantResult {
  status: GrantStatus;
  pointsGranted: number;
  balance: number;
}

async function currentBalance(username: string): Promise<number> {
  const acct = await PointsAccount.findById(username).lean();
  return acct?.balance ?? 0;
}

/** The admin "points cannon" — a manual comp, not an earned or purchased
 *  credit. Credits `balance` only, same invariant as creditPurchase:
 *  lifetimeEarned (the leaderboard basis) must never move for points nobody
 *  actually earned or paid for. Idempotent via a client-generated
 *  `idempotencyKey`, reusing PointsLedger's unique-index-plus-11000 idiom —
 *  the same mechanism awardForAction/creditPurchase rely on — so a
 *  double-submit (double-click, retried request) can't double-grant, while
 *  two deliberate separate grants to the same user (each with their own
 *  fresh key) are still both allowed. */
export async function grantPoints(
  adminUsername: string,
  targetUsername: string,
  points: number,
  reason: string | undefined,
  idempotencyKey: string,
): Promise<GrantResult> {
  await connectDB();

  if (!Number.isInteger(points) || points <= 0 || points > MAX_ADMIN_GRANT_POINTS) {
    return { status: 'invalid_amount', pointsGranted: 0, balance: await currentBalance(targetUsername) };
  }

  try {
    await PointsLedger.create({ username: targetUsername, actionType: 'admin_grant', points, refKey: idempotencyKey });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      return { status: 'duplicate', pointsGranted: 0, balance: await currentBalance(targetUsername) };
    }
    throw err;
  }

  // balance only — lifetimeEarned is untouched, by design.
  const acct = await PointsAccount.findByIdAndUpdate(
    targetUsername,
    { $inc: { balance: points }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  // Audit record — best-effort, never blocks or reverses an already-granted
  // credit. Mirrors creditPurchase's PointsPurchase write exactly.
  try {
    await PointsGrant.create({ username: targetUsername, grantedBy: adminUsername, points, reason, refKey: idempotencyKey });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code !== 11000) {
      console.error('[grantPoints] audit record failed after a successful credit:', { targetUsername, adminUsername, err });
    }
  }

  return { status: 'granted', pointsGranted: points, balance: acct?.balance ?? points };
}
