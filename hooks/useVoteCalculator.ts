import { useState, useEffect } from 'react';
import HiveClient from '@/lib/hive/hiveclient';
import { calculateVoteValue } from '@/lib/hive/voteValueCalculator';

interface HiveGlobals {
  rewardFund: { recent_claims: string; reward_balance: string };
  medianPrice: number;
}

// Module-level caches so every component shares one fetch per session
let globalsCache: HiveGlobals | null = null;
let globalsFetchPromise: Promise<HiveGlobals> | null = null;
const accountCache = new Map<string, any>();

async function fetchGlobals(): Promise<HiveGlobals> {
  if (globalsCache) return globalsCache;
  if (!globalsFetchPromise) {
    globalsFetchPromise = (async () => {
      const [rewardFund, priceData] = await Promise.all([
        HiveClient.database.call('get_reward_fund', ['post']),
        HiveClient.database.call('get_current_median_history_price', []),
      ]);
      const base = parseFloat(priceData.base);
      const quote = parseFloat(priceData.quote);
      globalsCache = { rewardFund, medianPrice: base / quote };
      globalsFetchPromise = null;
      return globalsCache;
    })();
  }
  return globalsFetchPromise;
}

async function fetchAccount(username: string): Promise<any | null> {
  if (accountCache.has(username)) return accountCache.get(username);
  const accounts = await HiveClient.database.getAccounts([username]);
  if (accounts?.[0]) accountCache.set(username, accounts[0]);
  return accounts?.[0] || null;
}

/**
 * Returns a `calculateDelta(weight)` function that estimates the HBD value
 * a vote of the given weight (0–100) would add to a post's payout.
 *
 * Data is fetched once per session and shared across all callers via
 * module-level caches, so mounting many vote-capable components is cheap.
 */
export function useVoteCalculator(username: string | null) {
  const [globals, setGlobals] = useState<HiveGlobals | null>(globalsCache);
  const [account, setAccount] = useState<any>(
    username ? (accountCache.get(username) ?? null) : null
  );

  useEffect(() => {
    fetchGlobals().then(setGlobals).catch(() => {});
  }, []);

  useEffect(() => {
    if (!username) return;
    fetchAccount(username).then(setAccount).catch(() => {});
  }, [username]);

  function calculateDelta(weight: number): number {
    if (!globals || !account) return 0;
    return calculateVoteValue(account, globals.rewardFund, weight, globals.medianPrice);
  }

  return { calculateDelta };
}
