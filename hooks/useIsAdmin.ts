'use client';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { authenticatedFetch } from '@/lib/points/client';

// Module-level cache, same shape as useMoodBadges.ts, but keyed by username
// (not a shared cross-account map) since this is only ever "is THIS session
// admin" — a username switch (logout/login as someone else) must not reuse a
// stale result for the wrong account.
const CACHE_DURATION_MS = 120_000;
let cache: { username: string; isAdmin: boolean } | null = null;
let cacheTimestamp = 0;
let inFlight: { username: string; promise: Promise<boolean> } | null = null;

async function fetchIsAdmin(username: string): Promise<boolean> {
  if (cache && cache.username === username && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
    return cache.isAdmin;
  }
  if (inFlight?.username === username) return inFlight.promise;

  const promise = (async () => {
    try {
      const res = await authenticatedFetch(username, '/api/admin/whoami', { method: 'GET' });
      const isAdmin = !!res && res.ok && (await res.json()).isAdmin === true;
      cache = { username, isAdmin };
      cacheTimestamp = Date.now();
      return isAdmin;
    } catch {
      cache = { username, isAdmin: false };
      cacheTimestamp = Date.now();
      return false;
    } finally {
      inFlight = null;
    }
  })();

  inFlight = { username, promise };
  return promise;
}

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { username, isLoggedIn } = useCurrentUser();
  const [isAdmin, setIsAdmin] = useState(cache?.username === username ? cache.isAdmin : false);
  const [loading, setLoading] = useState(!(cache?.username === username));

  useEffect(() => {
    if (!isLoggedIn || !username) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchIsAdmin(username).then(result => {
      if (!cancelled) {
        setIsAdmin(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [username, isLoggedIn]);

  return { isAdmin, loading };
}
