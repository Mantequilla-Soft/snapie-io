'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** A quota read is reused for this long before the next upload asks again. */
const MAX_AGE_MS = 60_000;

/**
 * Read a 3Speak upload quota lazily and cache it for a minute.
 *
 * `prefetch()` starts (or reuses) the read and resolves with the quota, or
 * null when nothing is known (no key, network error, 404 on an older
 * server). Callers never block an upload on a null. `invalidate()` drops
 * the cache, e.g. after a successful upload used a slot.
 */
export function useUploadQuota<T>(
  owner: string | null | undefined,
  load: (owner: string) => Promise<T | null>,
) {
  const [quota, setQuota] = useState<T | null>(null);
  const cache = useRef<{ owner: string; at: number; promise: Promise<T | null> } | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    // A different signed-in account must not see the last one's quota.
    cache.current = null;
    setQuota(null);
  }, [owner]);

  const prefetch = useCallback((): Promise<T | null> => {
    if (!owner) return Promise.resolve(null);
    const hit = cache.current;
    if (hit && hit.owner === owner && Date.now() - hit.at < MAX_AGE_MS) return hit.promise;
    const promise = loadRef.current(owner)
      .catch(() => null)
      .then((q) => {
        if (cache.current?.promise === promise) setQuota(q);
        return q;
      });
    cache.current = { owner, at: Date.now(), promise };
    return promise;
  }, [owner]);

  const invalidate = useCallback(() => {
    cache.current = null;
    setQuota(null);
  }, []);

  return { quota, prefetch, invalidate };
}
