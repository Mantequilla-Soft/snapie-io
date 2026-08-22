import { randomInt } from 'crypto';
import { connectDB } from '@/lib/db/mongodb';
import { RouletteSpin } from '@/lib/db/models/RouletteSpin';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import { MIN_STAKE, MAX_STAKE, SPIN_COOLDOWN_MS, ROULETTE_ODDS_BP, RouletteMultiplier } from '@/lib/points/rouletteConfig';

export type SpinStatus = 'spun' | 'duplicate' | 'insufficient_balance' | 'invalid_stake' | 'cooldown';

export interface SpinResult {
  status: SpinStatus;
  multiplier: RouletteMultiplier | null;
  payout: number;
  netDelta: number;
  balance: number;
}

async function currentBalance(username: string): Promise<number> {
  const acct = await PointsAccount.findById(username).lean();
  return acct?.balance ?? 0;
}

/** crypto.randomInt, not Math.random — this number decides real point-supply
 *  movement, same trust bar as anything else server-authoritative here. */
function rollOutcome(): { roll: number; multiplier: RouletteMultiplier } {
  const roll = randomInt(0, 10000);
  for (const { multiplier, thresholdBp } of ROULETTE_ODDS_BP) {
    if (roll < thresholdBp) return { roll, multiplier };
  }
  // Unreachable: ROULETTE_ODDS_BP's last threshold is 10000 and
  // randomInt(0, 10000) never returns 10000.
  return { roll, multiplier: 0 };
}

/** Spends `stake` points on a roulette spin. Same claim-then-charge shape as
 *  buyBadge, adapted for roulette:
 *
 *  - The "claim" is inserting the fully-formed RouletteSpin row up front —
 *    spinId's unique index (scoped to username) is the idempotency gate,
 *    exactly like buyBadge's owned-sku claim, catching E11000 as the "already
 *    spun" signal instead of double-spinning on a retried request.
 *  - The "charge" is a single guarded $inc of (payout - stake), covering the
 *    stake debit and any payout credit in one atomic update — deliberately
 *    not two separate writes, so there's no window where a crash could apply
 *    the debit without its payout (or vice versa).
 *  - If the charge fails (insufficient balance), the claim is rolled back —
 *    same as buyBadge — so the same spinId can be retried once the balance
 *    is topped up, rather than being permanently burned by a spin that never
 *    actually happened.
 *
 *  Never touches `lifetimeEarned` — a jackpot is just more spendable
 *  balance, same as a points purchase, per the marketplace roadmap's one
 *  hard rule (leaderboard reflects earning, never gambling or buying). */
export async function spinRoulette(username: string, spinId: string, stake: number): Promise<SpinResult> {
  await connectDB();

  if (!Number.isInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    return { status: 'invalid_stake', multiplier: null, payout: 0, netDelta: 0, balance: await currentBalance(username) };
  }

  // Cheap idempotency pre-check (the unique index on the claim insert below
  // is the real guarantee).
  const existing = await RouletteSpin.findOne({ username, spinId }).lean();
  if (existing) {
    return {
      status: 'duplicate',
      multiplier: existing.multiplier,
      payout: existing.payout,
      netDelta: existing.payout - existing.stake,
      balance: await currentBalance(username),
    };
  }

  // Cooldown: blunt macro/script spam independent of the house edge already
  // discouraging it economically.
  const last = await RouletteSpin.findOne({ username }).sort({ createdAt: -1 }).lean();
  if (last && Date.now() - last.createdAt.getTime() < SPIN_COOLDOWN_MS) {
    return { status: 'cooldown', multiplier: null, payout: 0, netDelta: 0, balance: await currentBalance(username) };
  }

  const { roll, multiplier } = rollOutcome();
  const payout = stake * multiplier;
  const netDelta = payout - stake;

  try {
    await RouletteSpin.create({ username, spinId, stake, multiplier, payout, serverRoll: roll });
  } catch (err: unknown) {
    // Lost an idempotency race — someone/something already claimed this
    // spinId. Return its already-settled result rather than spinning again.
    if ((err as { code?: number })?.code === 11000) {
      const dup = await RouletteSpin.findOne({ username, spinId }).lean();
      return {
        status: 'duplicate',
        multiplier: dup?.multiplier ?? null,
        payout: dup?.payout ?? 0,
        netDelta: (dup?.payout ?? 0) - (dup?.stake ?? 0),
        balance: await currentBalance(username),
      };
    }
    throw err;
  }

  const acct = await PointsAccount.findOneAndUpdate(
    { _id: username, balance: { $gte: stake } },
    { $inc: { balance: netDelta }, $set: { updatedAt: new Date() } },
    { new: true },
  ).lean();

  if (!acct) {
    // Insufficient balance — roll back the claim (see doc comment above).
    await RouletteSpin.deleteOne({ username, spinId });
    return { status: 'insufficient_balance', multiplier: null, payout: 0, netDelta: 0, balance: await currentBalance(username) };
  }

  return { status: 'spun', multiplier, payout, netDelta, balance: acct.balance ?? 0 };
}
