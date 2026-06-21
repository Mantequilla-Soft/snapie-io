'use client';
import { useEffect, useState } from 'react';

export type PatronTier = 'snaperino' | 'snapian' | 'snap-master';

interface PatronEntry {
  account: string;
  tier: PatronTier;
  via: 'subscription' | 'delegation' | 'both';
}

interface PatronsResponse {
  patrons: PatronEntry[];
}

// Patron status renders next to a username wherever one appears (Snap, blog
// post, profile header, who-to-follow row) — many components, no single
// shared ancestor worth prop-drilling through. Module-level cache (same
// pattern as MutedAccountsManager) so N simultaneously-mounted components
// share one fetch instead of each firing their own.
const CACHE_DURATION_MS = 120_000; // matches the proxy route's Cache-Control max-age
let cache: Map<string, PatronTier> | null = null;
let cacheTimestamp = 0;
let inFlight: Promise<Map<string, PatronTier>> | null = null;

async function fetchPatrons(): Promise<Map<string, PatronTier>> {
  if (cache && Date.now() - cacheTimestamp < CACHE_DURATION_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('/api/patrons');
      const data: PatronsResponse = res.ok ? await res.json() : { patrons: [] };
      cache = new Map(data.patrons.map(p => [p.account, p.tier]));
      cacheTimestamp = Date.now();
      return cache;
    } catch {
      cache = new Map();
      cacheTimestamp = Date.now();
      return cache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function usePatronStatus() {
  const [byAccount, setByAccount] = useState<Map<string, PatronTier>>(cache ?? new Map());
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    fetchPatrons().then(map => {
      if (!cancelled) {
        setByAccount(map);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const getTier = (account: string): PatronTier | null => byAccount.get(account) ?? null;

  return { byAccount, getTier, isLoading };
}
