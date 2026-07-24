import { connectDB } from '@/lib/db/mongodb';
import { PointsLedger } from '@/lib/db/models/PointsLedger';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import { PointsPurchase } from '@/lib/db/models/PointsPurchase';
import { verifyTransfer } from '@/lib/points/purchaseVerify';
import { hbdToPoints, MIN_PURCHASE_HBD, MAX_PURCHASE_HBD } from '@/lib/points/purchaseConfig';

export type PurchaseStatus = 'credited' | 'duplicate' | 'unverified' | 'out_of_range';

export interface PurchaseResult {
  status: PurchaseStatus;
  pointsCredited: number;
  balance: number;
}

async function currentBalance(username: string): Promise<number> {
  const acct = await PointsAccount.findById(username).lean();
  return acct?.balance ?? 0;
}

/** Verifies a real HBD transfer on-chain and credits `balance` — never
 *  `lifetimeEarned`, see the marketplace roadmap doc: buying points must
 *  never move the leaderboard. Idempotent by txid via PointsLedger's unique
 *  index — same mechanism the earn pipeline already relies on
 *  (awardForAction), deliberately reused rather than inventing a second one.
 *
 *  Write order matters here: the ledger row is the ONE idempotency gate, and
 *  the balance update happens immediately after it succeeds — mirroring
 *  awardForAction exactly. PointsPurchase (the audit record) is written
 *  LAST and is best-effort: if it fails after the ledger+balance writes
 *  already succeeded, the user's credit is still correct, we just log a
 *  missing audit row rather than fail an already-completed purchase.
 *  (Earlier version of this function used PointsPurchase as the gate
 *  instead — a crash between that write and the balance update left a
 *  "phantom duplicate" that permanently blocked the credit from ever
 *  landing, even on retry. Don't reintroduce that ordering.) */
export async function creditPurchase(username: string, txid: string): Promise<PurchaseResult> {
  await connectDB();

  // Cheap idempotency pre-check (the unique index below is the real
  // guarantee).
  const existingLedgerRow = await PointsLedger.findOne({ username, actionType: 'purchase', refKey: txid }).lean();
  if (existingLedgerRow) return { status: 'duplicate', pointsCredited: 0, balance: await currentBalance(username) };

  const verified = await verifyTransfer(txid, username);
  if (!verified) return { status: 'unverified', pointsCredited: 0, balance: await currentBalance(username) };

  if (verified.hbdAmount < MIN_PURCHASE_HBD || verified.hbdAmount > MAX_PURCHASE_HBD) {
    return { status: 'out_of_range', pointsCredited: 0, balance: await currentBalance(username) };
  }

  const points = hbdToPoints(verified.hbdAmount);

  try {
    await PointsLedger.create({ username, actionType: 'purchase', points, refKey: txid });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      return { status: 'duplicate', pointsCredited: 0, balance: await currentBalance(username) };
    }
    throw err;
  }

  // balance only — lifetimeEarned is untouched, by design.
  const acct = await PointsAccount.findByIdAndUpdate(
    username,
    { $inc: { balance: points }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true },
  ).lean();

  // Audit record — best-effort, never blocks or reverses an already-credited
  // purchase. A duplicate here (e.g. a retried request that got this far
  // twice somehow) is harmless; any other failure is logged, not thrown.
  try {
    await PointsPurchase.create({ username, txid, hbdAmount: verified.hbdAmount, pointsCredited: points });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code !== 11000) {
      console.error('[creditPurchase] audit record failed after a successful credit:', { username, txid, err });
    }
  }

  return { status: 'credited', pointsCredited: points, balance: acct?.balance ?? points };
}
