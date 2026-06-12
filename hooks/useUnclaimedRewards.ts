'use client';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import HiveClient from '@/lib/hive/hiveclient';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Module-level singleton keyed by username — Sidebar and BottomTabBar share one fetch.
const cache = new Map<string, boolean>();
const subscribers = new Map<string, Set<(v: boolean) => void>>();
const intervals = new Map<string, ReturnType<typeof setInterval>>();

function hasNonZeroReward(val: unknown): boolean {
  return parseFloat(String(val ?? '0')) > 0;
}

async function fetchRewards(username: string) {
  try {
    const [account] = await HiveClient.database.getAccounts([username]);
    if (!account) return;
    const has =
      hasNonZeroReward(account.reward_hive_balance) ||
      hasNonZeroReward(account.reward_hbd_balance) ||
      hasNonZeroReward(account.reward_vesting_balance);
    cache.set(username, has);
    subscribers.get(username)?.forEach(cb => cb(has));
  } catch {
    // silently ignore — stale value stays
  }
}

function subscribe(username: string, cb: (v: boolean) => void): () => void {
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

export function useUnclaimedRewards(): boolean {
  const { username } = useCurrentUser();
  const [hasRewards, setHasRewards] = useState(() => cache.get(username ?? '') ?? false);

  useEffect(() => {
    if (!username) {
      setHasRewards(false);
      return;
    }
    setHasRewards(cache.get(username) ?? false);
    return subscribe(username, setHasRewards);
  }, [username]);

  return hasRewards;
}
