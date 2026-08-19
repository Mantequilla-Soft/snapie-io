'use client';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import HiveClient from '@/lib/hive/hiveclient';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface UnclaimedRewardsDetail {
  has: boolean;
  /** Liquid HIVE portion of the pending reward. */
  hive: number;
  /** HBD portion of the pending reward. */
  hbd: number;
  /** HP-equivalent of the pending vesting-shares reward — reward_vesting_hive
   *  is precomputed by the node, so no manual VESTS math is needed here. */
  hp: number;
}

const EMPTY_DETAIL: UnclaimedRewardsDetail = { has: false, hive: 0, hbd: 0, hp: 0 };

// Module-level singleton keyed by username — every consumer (Sidebar LED,
// BottomTabBar dot, PendingRewardsBanner) shares one fetch/poll.
const cache = new Map<string, UnclaimedRewardsDetail>();
const subscribers = new Map<string, Set<(v: UnclaimedRewardsDetail) => void>>();
const intervals = new Map<string, ReturnType<typeof setInterval>>();

function toNumber(val: unknown): number {
  const n = parseFloat(String(val ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function applyDetail(username: string, detail: UnclaimedRewardsDetail) {
  cache.set(username, detail);
  subscribers.get(username)?.forEach(cb => cb(detail));
}

function detailFromRewardFields(rewards: {
  reward_hive_balance?: unknown;
  reward_hbd_balance?: unknown;
  reward_vesting_hive?: unknown;
}): UnclaimedRewardsDetail {
  const detail: UnclaimedRewardsDetail = {
    hive: toNumber(rewards.reward_hive_balance),
    hbd: toNumber(rewards.reward_hbd_balance),
    hp: toNumber(rewards.reward_vesting_hive),
    has: false,
  };
  detail.has = detail.hive > 0 || detail.hbd > 0 || detail.hp > 0;
  return detail;
}

async function fetchRewards(username: string) {
  try {
    const [account] = await HiveClient.database.getAccounts([username]);
    if (!account) return;
    applyDetail(username, detailFromRewardFields(account));
  } catch {
    // silently ignore — stale value stays
  }
}

/**
 * Feed reward balances that some other fetch (e.g. the wallet page's own
 * account load) already pulled from the chain into the shared cache, so the
 * banner reflects ground truth instead of waiting for its own poll timer.
 * Callers must only pass the *logged-in* user's own account data — never a
 * profile being viewed — since this cache drives that user's own banner.
 */
export function syncUnclaimedRewardsFromAccount(
  username: string,
  rewards: { reward_hive_balance?: unknown; reward_hbd_balance?: unknown; reward_vesting_hive?: unknown }
): void {
  applyDetail(username, detailFromRewardFields(rewards));
}

function subscribe(username: string, cb: (v: UnclaimedRewardsDetail) => void): () => void {
  if (!subscribers.has(username)) subscribers.set(username, new Set());
  subscribers.get(username)!.add(cb);

  if (!intervals.has(username)) {
    fetchRewards(username);
    intervals.set(username, setInterval(() => fetchRewards(username), POLL_INTERVAL_MS));
  } else if (cache.has(username)) {
    cb(cache.get(username)!);
  }

  return () => {
    const subs = subscribers.get(username);
    if (!subs) return;
    subs.delete(cb);
    if (subs.size === 0) {
      clearInterval(intervals.get(username)!);
      intervals.delete(username);
      subscribers.delete(username);
      cache.delete(username);
    }
  };
}

/**
 * Call right after a successful claim broadcast. Polls the chain until the
 * reward balance actually clears (broadcast success doesn't guarantee the
 * claim is in a block yet), updating the shared cache so the LED indicator
 * reflects reality instead of waiting for the next 5-minute poll.
 */
export async function refreshAfterClaim(username: string, attempts = 5, delayMs = 1500): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await fetchRewards(username);
    if (cache.get(username)?.has === false) return;
  }
}

export function useUnclaimedRewards(): boolean {
  return useUnclaimedRewardsDetail().has;
}

/** Same shared signal as useUnclaimedRewards, with the actual amounts —
 *  for anywhere that wants to say "0.3 HIVE pending" instead of just showing
 *  a dot. */
export function useUnclaimedRewardsDetail(): UnclaimedRewardsDetail {
  const { username } = useCurrentUser();
  const [detail, setDetail] = useState<UnclaimedRewardsDetail>(() => cache.get(username ?? '') ?? EMPTY_DETAIL);

  useEffect(() => {
    if (!username) {
      setDetail(EMPTY_DETAIL);
      return;
    }
    setDetail(cache.get(username) ?? EMPTY_DETAIL);
    return subscribe(username, setDetail);
  }, [username]);

  return detail;
}
