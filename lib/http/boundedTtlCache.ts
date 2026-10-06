interface TtlEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory cache with a TTL and a hard entry cap.
 * Insertion order is recency: a hit moves the key to the end, and a full
 * cache drops the oldest key. Expired entries are removed when the cache
 * is written, so the cap counts live keys.
 */
export function createBoundedTtlCache<T>(options: { ttlMs: number; maxEntries: number }) {
  const entries = new Map<string, TtlEntry<T>>();
  const ttlMs = options.ttlMs;
  const maxEntries = options.maxEntries;

  function dropExpired(now: number) {
    for (const [key, entry] of entries) {
      if (now >= entry.expiresAt) entries.delete(key);
    }
  }

  return {
    get size(): number {
      return entries.size;
    },

    /** `undefined` is a miss. A stored value may itself be `null`. */
    get(key: string, now = Date.now()): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    set(key: string, value: T, now = Date.now()): void {
      if (entries.has(key)) entries.delete(key);
      dropExpired(now);
      entries.set(key, { value, expiresAt: now + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}
