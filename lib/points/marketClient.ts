'use client';
import { authenticatedFetch, POINTS_SPENT_EVENT, PointsSpentDetail } from '@/lib/points/client';
// Type-only — marketService.ts pulls in Mongoose/DB code that must never
// reach the client bundle; `import type` guarantees it's erased at compile time.
import type {
  ItemDTO,
  ItemsPage,
  CatalogSort,
  BuyItemStatus,
  InventoryEntry,
  ThrowItemStatus,
  PileEntry,
  CreateItemStatus,
  ClaimOwnItemStatus,
} from '@/lib/points/marketService';
import type { ItemThrowTargetType } from '@/lib/db/models/ItemThrow';
// A plain number constant, no DB imports — safe to pull into the client bundle directly.
import { ITEM_CREATION_FEE } from '@/lib/points/marketConfig';

// Fired after a successful throw so an already-mounted PileTray on that
// post/Snap can patch its local state immediately — no refetch, no page
// reload. Carries the item (not just its id) and the thrower's username so
// PileTray can render the new/incremented row and "who threw it" entry
// straight from this payload, the same optimistic-update idea InteractionBar
// already uses for vote counts.
export const ITEM_THROWN_EVENT = 'snapie:item-thrown';

export interface ItemThrownDetail {
  targetAuthor: string;
  targetPermlink: string;
  /** Already redacted to "Anonymous" by throwItem() below when the throw
   *  was anonymous, so every listener sees exactly what a fresh getPile()
   *  fetch would return — no separate anonymous flag needed here. */
  throwerUsername: string;
  anonymous: boolean;
  item: ItemDTO;
}

export async function listMarketItems(sort: CatalogSort = 'hot', offset = 0): Promise<ItemsPage> {
  try {
    const res = await fetch(`/api/points/market/items?sort=${sort}&offset=${offset}`);
    if (!res.ok) return { items: [], hasMore: false };
    const data = (await res.json()) as ItemsPage;
    return { items: data.items ?? [], hasMore: !!data.hasMore };
  } catch {
    return { items: [], hasMore: false };
  }
}

export interface CreateItemClientResult {
  status: CreateItemStatus;
  item: ItemDTO | null;
  balance: number;
}

export async function createMarketItem(
  username: string,
  input: { name: string; description: string; imageUrl: string; price: number },
): Promise<CreateItemClientResult> {
  const res = await authenticatedFetch(username, '/api/points/market/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res) throw new Error('Could not start a session to submit this item. Please try again.');
  if (!res.ok) throw new Error('Could not submit this item. Please try again.');

  const data = (await res.json()) as CreateItemClientResult;
  if (data.status === 'submitted') {
    window.dispatchEvent(
      new CustomEvent<PointsSpentDetail>(POINTS_SPENT_EVENT, {
        detail: { spent: ITEM_CREATION_FEE, balance: data.balance },
      }),
    );
  }
  return data;
}

export interface BuyItemClientResult {
  status: BuyItemStatus;
  unitId: string | null;
  balance: number;
}

export async function buyItem(username: string, itemId: string, price: number): Promise<BuyItemClientResult> {
  // A fresh key per attempt — the server treats it as the purchase's
  // idempotency guard, so a retried/duplicate request can't double-charge.
  const purchaseRefKey = crypto.randomUUID();

  const res = await authenticatedFetch(username, `/api/points/market/items/${itemId}/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseRefKey }),
  });
  if (!res) throw new Error('Could not start a session to complete this purchase. Please try again.');
  if (!res.ok) throw new Error('Could not complete this purchase. Please try again.');

  const data = (await res.json()) as BuyItemClientResult;
  if (data.status === 'purchased') {
    window.dispatchEvent(
      new CustomEvent<PointsSpentDetail>(POINTS_SPENT_EVENT, {
        detail: { spent: price, balance: data.balance },
      }),
    );
  }
  return data;
}

export interface ClaimOwnItemClientResult {
  status: ClaimOwnItemStatus;
  unitId: string | null;
}

/** Free unit for the creator of their own item — no charge, so no
 *  POINTS_SPENT_EVENT to dispatch (balance never moves). */
export async function claimOwnItem(username: string, itemId: string): Promise<ClaimOwnItemClientResult> {
  const res = await authenticatedFetch(username, `/api/points/market/items/${itemId}/claim`, { method: 'POST' });
  if (!res) throw new Error('Could not start a session to claim this. Please try again.');
  if (!res.ok) throw new Error('Could not claim this. Please try again.');
  return (await res.json()) as ClaimOwnItemClientResult;
}

export async function getMyInventory(username: string): Promise<InventoryEntry[]> {
  const res = await authenticatedFetch(username, '/api/points/market/inventory', { method: 'GET' });
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { inventory: InventoryEntry[] };
  return data.inventory ?? [];
}

export interface ThrowItemClientResult {
  status: ThrowItemStatus;
  balance: number;
}

export async function throwItem(
  username: string,
  unitId: string,
  target: { author: string; permlink: string; type: ItemThrowTargetType },
  item: ItemDTO,
  anonymous = false,
): Promise<ThrowItemClientResult> {
  const res = await authenticatedFetch(username, '/api/points/market/throw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitId, targetAuthor: target.author, targetPermlink: target.permlink, targetType: target.type, anonymous }),
  });
  if (!res) throw new Error('Could not start a session to throw this. Please try again.');
  if (!res.ok) throw new Error('Could not throw this. Please try again.');

  const data = (await res.json()) as ThrowItemClientResult;
  if (data.status === 'thrown') {
    window.dispatchEvent(
      new CustomEvent<ItemThrownDetail>(ITEM_THROWN_EVENT, {
        detail: {
          targetAuthor: target.author,
          targetPermlink: target.permlink,
          throwerUsername: anonymous ? 'Anonymous' : username,
          anonymous,
          item,
        },
      }),
    );
    // Anonymous throws burn extra points on top of consuming the unit —
    // update the live balance display the same way a purchase would.
    if (anonymous) {
      window.dispatchEvent(
        new CustomEvent<PointsSpentDetail>(POINTS_SPENT_EVENT, {
          detail: { spent: item.price, balance: data.balance },
        }),
      );
    }
  }
  return data;
}

// Admin moderation (list pending / approve / reject) isn't wrapped here —
// app/settings/admin/market/page.tsx talks to those routes directly, same
// as app/settings/admin/grant-points/page.tsx does for its own admin route,
// so a 403 can be told apart from "nothing pending" instead of being
// swallowed into an empty result like the helpers above do for the public
// listing.

export async function getPile(author: string, permlink: string): Promise<PileEntry[]> {
  try {
    const res = await fetch(`/api/points/market/pile/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { pile: PileEntry[] };
    return data.pile ?? [];
  } catch {
    return [];
  }
}
