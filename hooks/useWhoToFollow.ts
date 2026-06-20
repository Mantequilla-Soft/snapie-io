'use client';
import { useEffect, useMemo, useState } from 'react';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface TrendingAuthor {
  account: string;
  count: number;
}

interface TrendingAuthorsResponse {
  authors: TrendingAuthor[];
  warming: boolean;
}

interface UseWhoToFollowOptions {
  /** Authors the current user has already engaged with (e.g. voted on) in
   *  the currently-loaded feed — floated to the front of the candidate list.
   *  Computed from data already in memory elsewhere; this hook makes no
   *  extra fetches for it. */
  engagedAuthors?: Set<string>;
  limit?: number;
}

/**
 * Fetch-once-on-mount (no polling — trending shifts slowly and the proxy
 * route is already server-cached, so a setInterval here would just be
 * unnecessary client cost for a low-priority sidebar widget).
 */
export function useWhoToFollow({ engagedAuthors, limit = 20 }: UseWhoToFollowOptions = {}) {
  const { username } = useCurrentUser();
  // Unsorted, mute/self-filtered pool from the one-time fetch below. Kept
  // separate from the engagement-ranked output so that engagement data
  // arriving later (the snap feed loads asynchronously and may resolve
  // after this fetch completes) can still re-rank without refetching.
  const [rawCandidates, setRawCandidates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [res, mutedSet] = await Promise.all([
          fetch(`/api/trending-authors?limit=${limit}`),
          mutedAccountsManager.getMutedList(username ?? undefined),
        ]);
        if (cancelled) return;
        if (!res.ok) {
          setRawCandidates([]);
          return;
        }
        const data: TrendingAuthorsResponse = await res.json();
        if (data.warming) {
          setRawCandidates([]);
          return;
        }

        const filtered = data.authors
          .map(a => a.account)
          .filter(account => account !== username && !mutedSet.has(account.toLowerCase()));

        setRawCandidates(filtered);
      } catch {
        if (!cancelled) setRawCandidates([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [username, limit]);

  // Two-tier sort: engaged-with authors float to the front, otherwise
  // preserve the trending order already returned by the sidecar. Cheap
  // in-memory re-sort — no network call — so it's safe to react to
  // engagedAuthors changing after the fetch above already resolved.
  const candidates = useMemo(() => {
    if (!engagedAuthors || engagedAuthors.size === 0) return rawCandidates;
    return [...rawCandidates].sort((a, b) => {
      const aEngaged = engagedAuthors.has(a) ? 1 : 0;
      const bEngaged = engagedAuthors.has(b) ? 1 : 0;
      return bEngaged - aEngaged;
    });
  }, [rawCandidates, engagedAuthors]);

  return { candidates, isLoading };
}
