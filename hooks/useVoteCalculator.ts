import HiveClient from '@/lib/hive/hiveclient';
import { calculateVoteValue } from '@/lib/hive/voteValueCalculator';

interface HiveGlobals {
  rewardFund: { recent_claims: string; reward_balance: string };
  medianPrice: number;
}

// Module-level caches so every component shares one fetch per session.
// accountCache is intentionally not invalidated after votes — the estimate
// drifts slightly as mana regenerates, which is acceptable for a UI hint.
let globalsCache: HiveGlobals | null = null;
let globalsFetchPromise: Promise<HiveGlobals> | null = null;
const accountCache = new Map<string, any>();

async function fetchGlobals(): Promise<HiveGlobals> {
  if (globalsCache) return globalsCache;
  if (!globalsFetchPromise) {
    globalsFetchPromise = (async () => {
      try {
        const [rewardFund, priceData] = await Promise.all([
          HiveClient.database.call('get_reward_fund', ['post']),
          HiveClient.database.call('get_current_median_history_price', []),
        ]);
        const base = parseFloat(priceData.base);
        const quote = parseFloat(priceData.quote);
        globalsCache = { rewardFund, medianPrice: base / quote };
        return globalsCache;
      } finally {
        // Always clear so a failed fetch can be retried on next call
        globalsFetchPromise = null;
      }
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
 *
 * `calculateDelta` is async and awaits the cached fetches directly, rather
 * than reading them off React state populated by a fire-and-forget effect —
 * that state could still be null at the moment of a vote (an effect that
 * hasn't resolved yet, or failed and was silently swallowed), permanently
 * showing a $0.00 optimistic payout next to an already-filled heart, since
 * the two are otherwise unrelated pieces of state. Awaiting the promise
 * directly means a vote right after page load waits the (usually
 * sub-second, already-in-flight) fetch instead of silently giving up.
 */
export function useVoteCalculator(username: string | null) {
  async function calculateDelta(weight: number): Promise<number> {
    if (!username) return 0;
    try {
      const [globals, account] = await Promise.all([fetchGlobals(), fetchAccount(username)]);
      if (!account) return 0;
      return calculateVoteValue(account, globals.rewardFund, weight, globals.medianPrice);
    } catch {
      return 0;
    }
  }

  return { calculateDelta };
}

/**
 * Exposes the same cached reward-fund/price globals as useVoteCalculator, for
 * callers that already have rshares (e.g. a voter list) and just need to
 * convert them to a dollar value without an account lookup.
 */
export function getHiveGlobals(): Promise<HiveGlobals> {
  return fetchGlobals();
}
