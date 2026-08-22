import { connectDB } from '@/lib/db/mongodb';
import { MoodBadges } from '@/lib/db/models/MoodBadges';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import { MoodBadgePurchase } from '@/lib/db/models/MoodBadgePurchase';
import { MOOD_BADGES, MoodBadgeSku } from '@/lib/moodBadges/constants';

export type BuyBadgeStatus = 'purchased' | 'already_owned' | 'insufficient_balance';

export interface BuyBadgeResult {
  status: BuyBadgeStatus;
  owned: string[];
  equipped: string | null;
  balance: number;
}

async function currentBalance(username: string): Promise<number> {
  const acct = await PointsAccount.findById(username).lean();
  return acct?.balance ?? 0;
}

async function currentBadges(username: string): Promise<{ owned: string[]; equipped: string | null }> {
  const doc = await MoodBadges.findById(username).lean();
  return { owned: doc?.owned ?? [], equipped: doc?.equipped ?? null };
}

/** Spends points on a mood badge. First real spend mechanic in this
 *  codebase — see the ordering rationale below, adapted from the
 *  ledger-first idiom awardForAction/creditPurchase already use, but
 *  reordered for a spend's risk shape (the value-transfer must not
 *  outlive the claim, unlike an earn's audit record which can safely lag
 *  behind the credit). */
export async function buyBadge(username: string, sku: MoodBadgeSku): Promise<BuyBadgeResult> {
  await connectDB();
  const price = MOOD_BADGES[sku].price;

  // Step 1: atomically claim the sku, guarded against already owning it.
  // This single op is the idempotency gate — no separate ledger collection
  // needed. If a doc already exists and already owns `sku`, the filter
  // below doesn't match it; with upsert:true, Mongo then tries to insert a
  // new doc with the same _id, hits the unique _id index, and throws
  // 11000 — the same "catch 11000 as the real guarantee" idiom used by
  // awardForAction/creditPurchase. This is also what closes the
  // concurrent-double-buy race: two simultaneous calls can't both win here.
  try {
    await MoodBadges.findOneAndUpdate(
      { _id: username, owned: { $ne: sku } },
      { $addToSet: { owned: sku } },
      { upsert: true },
    );
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      const badges = await currentBadges(username);
      return { status: 'already_owned', ...badges, balance: await currentBalance(username) };
    }
    throw err;
  }

  // Step 2: only having atomically claimed the sku, charge for it.
  const acct = await PointsAccount.findOneAndUpdate(
    { _id: username, balance: { $gte: price } },
    { $inc: { balance: -price } },
    { new: true },
  ).lean();

  if (!acct) {
    // Insufficient balance — roll back the claim so the sku isn't stuck
    // "owned" without ever being paid for, and a retry (after earning or
    // buying more points) is possible.
    await MoodBadges.findByIdAndUpdate(username, { $pull: { owned: sku } });
    const badges = await currentBadges(username);
    return { status: 'insufficient_balance', ...badges, balance: await currentBalance(username) };
  }

  // Step 3: auto-equip only if nothing's currently equipped — first
  // purchase becomes the equipped one for free convenience; switching
  // afterward is a separate explicit action, not touched here.
  await MoodBadges.findOneAndUpdate({ _id: username, equipped: null }, { $set: { equipped: sku } });

  // Step 4: audit record — best-effort, written LAST, never blocks or
  // reverses an already-completed purchase. Same ordering rationale as
  // purchaseService.ts's creditPurchase() (see its doc comment for the past
  // bug this avoids): the charge above is already final by this point, so a
  // failure here just means a missing history row, not a broken purchase.
  try {
    await MoodBadgePurchase.create({ username, sku, price });
  } catch (err: unknown) {
    console.error('[buyBadge] audit record failed after a successful purchase:', { username, sku, err });
  }

  const badges = await currentBadges(username);
  return { status: 'purchased', ...badges, balance: acct.balance ?? 0 };
}

export type EquipBadgeStatus = 'equipped' | 'not_owned';

export interface EquipBadgeResult {
  status: EquipBadgeStatus;
  equipped: string | null;
}

/** Server-authoritative — never trusts that the client only offers an
 *  owned sku as a choice. `sku: null` unequips (shows nothing). */
export async function equipBadge(username: string, sku: MoodBadgeSku | null): Promise<EquipBadgeResult> {
  await connectDB();

  if (sku !== null) {
    const doc = await MoodBadges.findById(username).lean();
    if (!doc?.owned.includes(sku)) {
      return { status: 'not_owned', equipped: doc?.equipped ?? null };
    }
  }

  await MoodBadges.findByIdAndUpdate(username, { $set: { equipped: sku } }, { upsert: true });
  return { status: 'equipped', equipped: sku };
}

/** { username -> equipped sku } for every user with a badge equipped —
 *  bulk, for rendering across a feed of many avatars in one request,
 *  mirroring app/api/patrons/route.ts's shape. */
export async function getEquippedMap(): Promise<Record<string, string>> {
  await connectDB();
  const docs = await MoodBadges.find({ equipped: { $ne: null } }, { equipped: 1 }).lean();
  const map: Record<string, string> = {};
  for (const doc of docs) {
    if (doc.equipped) map[doc._id] = doc.equipped;
  }
  return map;
}

export interface MyBadges {
  owned: string[];
  equipped: string | null;
}

export async function getMyBadges(username: string): Promise<MyBadges> {
  await connectDB();
  return currentBadges(username);
}
