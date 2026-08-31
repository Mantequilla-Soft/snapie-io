import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { connectDB } from '@/lib/db/mongodb';
import { Item, IItem } from '@/lib/db/models/Item';
import { ItemUnit, IItemUnit } from '@/lib/db/models/ItemUnit';
import { ItemThrow, ItemThrowTargetType } from '@/lib/db/models/ItemThrow';
import { PointsAccount } from '@/lib/db/models/PointsAccount';
import { PointsLedger } from '@/lib/db/models/PointsLedger';
import { ITEM_CREATION_FEE, ITEM_CREATION_DAILY_CAP, ITEM_CREATOR_SHARE_BP, MAX_THROWERS_PER_ITEM } from '@/lib/points/marketConfig';
import { currentBalance } from '@/lib/points/accountUtils';

export interface ItemDTO {
  id: string;
  creatorUsername: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  purchaseCount: number;
}

function toItemDTO(item: IItem): ItemDTO {
  return {
    id: String(item._id),
    creatorUsername: item.creatorUsername,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    price: item.price,
    purchaseCount: item.purchaseCount ?? 0,
  };
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type CatalogSort = 'new' | 'hot';

export interface ItemsPage {
  items: ItemDTO[];
  hasMore: boolean;
}

const CATALOG_PAGE_SIZE = 24;
const CATALOG_PAGE_SIZE_MAX = 50;

/** Public catalog — approved items only. `hot` sorts by the denormalized
 *  purchaseCount (design decision 6): O(1) per query, unlike aggregating
 *  ItemUnit fresh every request, which would get slower as the market
 *  grows. Offset pagination, same shape as awardService.getLeaderboard —
 *  fine at this scale (hundreds to low thousands of items, not millions). */
export async function listApprovedItems(sort: CatalogSort = 'hot', offset = 0, limit = CATALOG_PAGE_SIZE): Promise<ItemsPage> {
  await connectDB();
  const pageSize = Math.min(Math.max(limit, 1), CATALOG_PAGE_SIZE_MAX);
  const safeOffset = Math.max(offset, 0);
  const sortSpec: Record<string, 1 | -1> =
    sort === 'new' ? { createdAt: -1 } : { purchaseCount: -1, createdAt: -1 };

  const rows = await Item.find({ status: 'approved' })
    .sort(sortSpec)
    .skip(safeOffset)
    .limit(pageSize + 1);
  const hasMore = rows.length > pageSize;
  return { items: rows.slice(0, pageSize).map(toItemDTO), hasMore };
}

/** Admin-only seeding path, unchanged from Phase 0 — creates an item
 *  pre-approved and fee-free, since only an allowlisted admin can call this
 *  at all. Stays alongside the public createItem() below as a shortcut for
 *  quickly seeding/curating the catalog without going through review. */
export async function adminCreateItem(
  adminUsername: string,
  input: { creatorUsername: string; name: string; description: string; imageUrl: string; price: number },
): Promise<ItemDTO> {
  await connectDB();
  const item = await Item.create({
    creatorUsername: input.creatorUsername,
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl,
    price: input.price,
    status: 'approved',
    approvedAt: new Date(),
    approvedBy: adminUsername,
  });
  return toItemDTO(item);
}

export type CreateItemStatus = 'submitted' | 'capped' | 'insufficient_balance';

export interface CreateItemResult {
  status: CreateItemStatus;
  item: ItemDTO | null;
  balance: number;
}

/** Public item creation — submits for review (status 'pending'), burning
 *  the creation fee immediately regardless of the eventual approve/reject
 *  outcome (design decision 3: the fee, not the daily cap, is the real
 *  anti-spam deterrent). Claim-then-charge, same shape as buyItem: the item
 *  is minted first, then charged for; if the charge fails, the item is
 *  rolled back — nothing is ever submitted without payment. */
export async function createItem(
  username: string,
  input: { name: string; description: string; imageUrl: string; price: number },
): Promise<CreateItemResult> {
  await connectDB();

  const todayCount = await PointsLedger.countDocuments({
    username,
    actionType: 'item_creation_fee',
    createdAt: { $gte: startOfUtcDay() },
  });
  if (todayCount >= ITEM_CREATION_DAILY_CAP) {
    return { status: 'capped', item: null, balance: await currentBalance(username) };
  }

  const item = await Item.create({
    creatorUsername: username,
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl,
    price: input.price,
    status: 'pending',
  });

  let acct;
  try {
    acct = await PointsAccount.findOneAndUpdate(
      { _id: username, balance: { $gte: ITEM_CREATION_FEE } },
      { $inc: { balance: -ITEM_CREATION_FEE } },
      { new: true },
    ).lean();
  } catch (err: unknown) {
    // The charge itself failed (not just "insufficient balance") — undo the
    // submission so a transient DB error can't leave an unpaid Item sitting
    // in the review queue. Safe to always delete here: nothing else has
    // referenced this Item yet.
    await Item.deleteOne({ _id: item._id }).catch(() => {});
    throw err;
  }

  if (!acct) {
    // Insufficient balance — roll back the submission; nothing was paid for.
    await Item.deleteOne({ _id: item._id });
    return { status: 'insufficient_balance', item: null, balance: await currentBalance(username) };
  }

  try {
    await PointsLedger.create({ username, actionType: 'item_creation_fee', points: -ITEM_CREATION_FEE, refKey: String(item._id) });
  } catch (err: unknown) {
    console.error('[createItem] audit record failed after a successful submission:', { username, itemId: item._id, err });
  }

  return { status: 'submitted', item: toItemDTO(item), balance: acct.balance ?? 0 };
}

export type BuyItemStatus = 'purchased' | 'already_purchased' | 'insufficient_balance' | 'item_not_found' | 'self_purchase';

export interface BuyItemResult {
  status: BuyItemStatus;
  unitId: string | null;
  balance: number;
}

/** Thrown inside the withTransaction callback to signal "abort — the
 *  buyer's balance guard failed," distinct from a genuine unexpected error
 *  (which should propagate and surface as a 500, not a quiet rollback). */
class InsufficientBalanceError extends Error {}

/** Buys one unit of an approved item. Claim-then-charge, same shape as
 *  lib/moodBadges/service.ts's buyBadge for the "claim" half — a brand-new
 *  ItemUnit document, guarded by a unique index on `purchaseRefKey` (a
 *  client-minted idempotency key, the same role Roulette's spinId plays)
 *  instead of `_id`/sku uniqueness, since buying multiple units of the same
 *  item is the whole point.
 *
 *  The "charge" half is where this diverges from every other spend flow in
 *  the codebase: buyer-debit and creator-credit are ONE economic event
 *  (design decision 2), so unlike a single-account `$inc`, this needs a real
 *  Mongo multi-document transaction — confirmed supported on this
 *  deployment. `purchaseCount` is bumped in the same transaction (cheap
 *  insurance against it drifting out of sync with real sales, even though
 *  it's "just" a display counter). */
export async function buyItem(username: string, itemId: string, purchaseRefKey: string): Promise<BuyItemResult> {
  await connectDB();

  const item = await Item.findOne({ _id: itemId, status: 'approved' }).lean();
  if (!item) return { status: 'item_not_found', unitId: null, balance: await currentBalance(username) };

  // Blunts the cheapest self-deal loop (buy your own item straight back);
  // does not attempt to detect alt accounts — see design decision 2.
  if (item.creatorUsername === username) {
    return { status: 'self_purchase', unitId: null, balance: await currentBalance(username) };
  }

  // Step 1: claim — mint the unit first. Guarded by purchaseRefKey's unique
  // index, so a retried request with the same key can't mint a second unit.
  let unit: IItemUnit;
  try {
    unit = await ItemUnit.create({
      itemId: item._id,
      ownerUsername: username,
      status: 'owned',
      purchaseRefKey,
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      const existing = await ItemUnit.findOne({ purchaseRefKey }).lean();
      return { status: 'already_purchased', unitId: existing ? String(existing._id) : null, balance: await currentBalance(username) };
    }
    throw err;
  }

  // Step 2: only having atomically claimed the unit, charge for it — buyer
  // debit, creator credit, and the purchaseCount bump all-or-nothing.
  const creatorShare = Math.floor((item.price * ITEM_CREATOR_SHARE_BP) / 10000);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const acct = await PointsAccount.findOneAndUpdate(
        { _id: username, balance: { $gte: item.price } },
        { $inc: { balance: -item.price } },
        { new: true, session },
      );
      if (!acct) throw new InsufficientBalanceError();

      if (creatorShare > 0) {
        // Upsert — unlike the buyer above, the creator's account must be
        // credited even if they've never held a balance before.
        await PointsAccount.findOneAndUpdate(
          { _id: item.creatorUsername },
          { $inc: { balance: creatorShare } },
          { upsert: true, session },
        );
      }

      await Item.updateOne({ _id: item._id }, { $inc: { purchaseCount: 1 } }, { session });
    });
  } catch (err: unknown) {
    // withTransaction guarantees atomicity: whatever failed, none of the
    // debit/credit/purchaseCount writes landed — so it's always safe to
    // undo the claim here, not just on insufficient balance. Otherwise a
    // transient error (write conflict, replica-set hiccup) would leave the
    // buyer with a free, unpaid, throwable unit and no way to recover it.
    await ItemUnit.deleteOne({ _id: unit._id }).catch(() => {});
    if (err instanceof InsufficientBalanceError) {
      return { status: 'insufficient_balance', unitId: null, balance: await currentBalance(username) };
    }
    throw err;
  } finally {
    await session.endSession();
  }

  // Step 3: audit records — best-effort, written last, never block or
  // reverse an already-committed transaction. Same refKey on both rows
  // (this sale) but different username+actionType, so the ledger's unique
  // index doesn't collide between them.
  try {
    await PointsLedger.create({ username, actionType: 'item_purchase', points: -item.price, refKey: purchaseRefKey });
    if (creatorShare > 0) {
      await PointsLedger.create({ username: item.creatorUsername, actionType: 'item_sale', points: creatorShare, refKey: purchaseRefKey });
    }
  } catch (err: unknown) {
    console.error('[buyItem] audit record failed after a successful purchase:', { username, itemId, err });
  }

  return { status: 'purchased', unitId: String(unit._id), balance: await currentBalance(username) };
}

export type ClaimOwnItemStatus = 'claimed' | 'item_not_found' | 'not_owner';

export interface ClaimOwnItemResult {
  status: ClaimOwnItemStatus;
  unitId: string | null;
}

/** Free unit for the creator of their own item — the self-purchase block in
 *  buyItem exists to stop an alt-account free-points loop, but as a side
 *  effect it also stops a creator from ever owning their own creation, even
 *  for free. This is deliberately NOT a purchase: no charge, no ledger row,
 *  no purchaseCount bump (it's not a sale), and deliberately unlimited —
 *  there's no economic exploit to guard against when no points move, so a
 *  creator throwing their own item at posts as often as they like is no
 *  different from anyone else buying a pile of units and doing the same. */
export async function claimOwnItem(username: string, itemId: string): Promise<ClaimOwnItemResult> {
  await connectDB();

  const item = await Item.findOne({ _id: itemId, status: 'approved' }).lean();
  if (!item) return { status: 'item_not_found', unitId: null };
  if (item.creatorUsername !== username) return { status: 'not_owner', unitId: null };

  const unit = await ItemUnit.create({
    itemId: item._id,
    ownerUsername: username,
    status: 'owned',
    purchaseRefKey: `own-${randomUUID()}`,
  });

  return { status: 'claimed', unitId: String(unit._id) };
}

export interface InventoryEntry {
  item: ItemDTO;
  unitIds: string[];
}

/** Caller's owned (unthrown) units, grouped by item — mirrors getMyBadges'
 *  role for the item market. */
export async function getInventory(username: string): Promise<InventoryEntry[]> {
  await connectDB();
  const units = await ItemUnit.find({ ownerUsername: username, status: 'owned' }).lean();
  if (units.length === 0) return [];

  const itemIds = Array.from(new Set(units.map(u => String(u.itemId))));
  const items = await Item.find({ _id: { $in: itemIds } });
  const itemById = new Map(items.map(i => [String(i._id), toItemDTO(i)]));

  const grouped = new Map<string, string[]>();
  for (const unit of units) {
    const key = String(unit.itemId);
    if (!itemById.has(key)) continue; // item was deleted/rejected after purchase — skip defensively
    grouped.set(key, [...(grouped.get(key) ?? []), String(unit._id)]);
  }

  return Array.from(grouped.entries()).map(([itemId, unitIds]) => ({
    item: itemById.get(itemId)!,
    unitIds,
  }));
}

export type ThrowItemStatus = 'thrown' | 'not_found' | 'insufficient_balance';

export interface ThrowItemResult {
  status: ThrowItemStatus;
  balance: number;
}

/** Consumes one owned unit and records the throw. The ownerUsername+status
 *  guard on the claim below is both "you can only throw your own unit" and
 *  the double-throw idempotency gate — a retried/duplicate request just
 *  finds no matching 'owned' unit and returns 'not_found'.
 *
 *  An anonymous throw additionally burns the item's price in points — pure
 *  sink, no counterpart credit anywhere (unlike buyItem's creator split).
 *  Claim-then-charge again: the unit is already consumed by the time the
 *  burn is attempted, so on insufficient balance the claim is rolled back
 *  (unit goes back to 'owned', nothing thrown, nothing charged) rather than
 *  leaving a paid-for-nothing throw or an unpaid-for anonymous one. */
export async function throwItem(
  username: string,
  unitId: string,
  target: { author: string; permlink: string; type: ItemThrowTargetType },
  anonymous = false,
): Promise<ThrowItemResult> {
  await connectDB();

  const unit = await ItemUnit.findOneAndUpdate(
    { _id: unitId, ownerUsername: username, status: 'owned' },
    { $set: { status: 'thrown', thrownAt: new Date() } },
    { new: true },
  );
  if (!unit) return { status: 'not_found', balance: await currentBalance(username) };

  let anonFee = 0;
  if (anonymous) {
    try {
      const item = await Item.findById(unit.itemId).lean();
      anonFee = item?.price ?? 0;
      if (anonFee > 0) {
        const acct = await PointsAccount.findOneAndUpdate(
          { _id: username, balance: { $gte: anonFee } },
          { $inc: { balance: -anonFee } },
          { new: true },
        ).lean();
        if (!acct) {
          // Can't afford the burn — undo the claim entirely, nothing thrown.
          await ItemUnit.findByIdAndUpdate(unit._id, { $set: { status: 'owned', thrownAt: null } });
          return { status: 'insufficient_balance', balance: await currentBalance(username) };
        }
      }
    } catch (err: unknown) {
      // Anything else going wrong here (not just insufficient balance) —
      // undo the claim too. Nothing downstream (ItemThrow, the ledger row)
      // has been written yet, so the unit must not be left stranded as
      // 'thrown' with no record of where it went.
      await ItemUnit.findByIdAndUpdate(unit._id, { $set: { status: 'owned', thrownAt: null } }).catch(() => {});
      throw err;
    }
  }

  try {
    await ItemThrow.create({
      itemId: unit.itemId,
      unitId: unit._id,
      throwerUsername: username,
      targetAuthor: target.author,
      targetPermlink: target.permlink,
      targetType: target.type,
      anonymous,
    });
  } catch (err: unknown) {
    // The unit is already marked 'thrown' (and, if anonymous, already
    // charged) at this point — a failure here would only be a duplicate
    // insert on unitId's unique index, which can't happen given the guard
    // above, or a genuine DB hiccup. Log rather than silently drop it.
    console.error('[throwItem] ItemThrow record failed after unit was marked thrown:', { username, unitId, err });
  }

  if (anonymous && anonFee > 0) {
    try {
      await PointsLedger.create({ username, actionType: 'item_anon_throw_fee', points: -anonFee, refKey: String(unit._id) });
    } catch (err: unknown) {
      console.error('[throwItem] anon-fee audit record failed after a successful burn:', { username, unitId, err });
    }
  }

  return { status: 'thrown', balance: await currentBalance(username) };
}

const ANONYMOUS_THROWER_LABEL = 'Anonymous';

export interface PileThrower {
  username: string;
  createdAt: string;
  /** True when this throw was anonymous — `username` is already redacted to
   *  ANONYMOUS_THROWER_LABEL in that case; the real identity stays in
   *  ItemThrow.throwerUsername for moderation, never sent here. */
  anonymous: boolean;
}

export interface PileEntry {
  item: ItemDTO;
  count: number;
  recentThrowers: PileThrower[];
}

/** Everything thrown at one post/Snap, grouped by item with a count and a
 *  recent-throwers list — the Pile tray's data source. Anonymous throws keep
 *  their real thrower on file (see ItemThrow.anonymous) but are redacted
 *  here — this is the only read path the public UI uses. */
export async function getPile(author: string, permlink: string): Promise<PileEntry[]> {
  await connectDB();

  const throws = await ItemThrow.find({ targetAuthor: author, targetPermlink: permlink })
    .sort({ createdAt: -1 })
    .lean();
  if (throws.length === 0) return [];

  const itemIds = Array.from(new Set(throws.map(t => String(t.itemId))));
  const items = await Item.find({ _id: { $in: itemIds } });
  const itemById = new Map(items.map(i => [String(i._id), toItemDTO(i)]));

  const grouped = new Map<string, { count: number; throwers: PileThrower[] }>();
  for (const t of throws) {
    const key = String(t.itemId);
    if (!itemById.has(key)) continue; // item deleted after being thrown — skip defensively
    const entry = grouped.get(key) ?? { count: 0, throwers: [] };
    entry.count += 1;
    if (entry.throwers.length < MAX_THROWERS_PER_ITEM) {
      entry.throwers.push({
        username: t.anonymous ? ANONYMOUS_THROWER_LABEL : t.throwerUsername,
        createdAt: t.createdAt.toISOString(),
        anonymous: t.anonymous,
      });
    }
    grouped.set(key, entry);
  }

  return Array.from(grouped.entries())
    .map(([itemId, { count, throwers }]) => ({ item: itemById.get(itemId)!, count, recentThrowers: throwers }))
    .sort((a, b) => b.count - a.count);
}

// --- Admin moderation --------------------------------------------------

/** Oldest first — FIFO review queue. */
export async function listPendingItems(): Promise<ItemDTO[]> {
  await connectDB();
  const items = await Item.find({ status: 'pending' }).sort({ createdAt: 1 });
  return items.map(toItemDTO);
}

export type ModerateItemStatus = 'approved' | 'rejected' | 'not_found';

export async function approveItem(adminUsername: string, itemId: string): Promise<ModerateItemStatus> {
  await connectDB();
  const result = await Item.findOneAndUpdate(
    { _id: itemId, status: 'pending' },
    { $set: { status: 'approved', approvedAt: new Date(), approvedBy: adminUsername } },
  );
  return result ? 'approved' : 'not_found';
}

/** Rejection never refunds the creation fee — see design decision 3. */
export async function rejectItem(adminUsername: string, itemId: string): Promise<ModerateItemStatus> {
  await connectDB();
  const result = await Item.findOneAndUpdate(
    { _id: itemId, status: 'pending' },
    { $set: { status: 'rejected', approvedAt: new Date(), approvedBy: adminUsername } },
  );
  return result ? 'rejected' : 'not_found';
}
