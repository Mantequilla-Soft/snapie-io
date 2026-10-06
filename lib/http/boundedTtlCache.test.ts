import { describe, expect, it } from 'vitest';
import { createBoundedTtlCache } from './boundedTtlCache';

describe('createBoundedTtlCache', () => {
  it('returns a stored value until the TTL, including an explicit null', () => {
    const cache = createBoundedTtlCache<string | null>({ ttlMs: 1_000, maxEntries: 4 });
    cache.set('photo', 'image/jpeg', 0);
    cache.set('miss', null, 0);
    expect(cache.get('photo', 999)).toBe('image/jpeg');
    expect(cache.get('miss', 999)).toBeNull();
    expect(cache.get('photo', 1_000)).toBeUndefined();
    expect(cache.get('missing', 0)).toBeUndefined();
  });

  it('drops the oldest entry once the cap is reached and forgets expired keys', () => {
    const cache = createBoundedTtlCache<string>({ ttlMs: 1_000, maxEntries: 2 });
    cache.set('a', 'a', 0);
    cache.set('b', 'b', 0);
    cache.set('c', 'c', 0);
    expect(cache.get('a', 0)).toBeUndefined();
    expect(cache.get('b', 0)).toBe('b');
    expect(cache.get('c', 0)).toBe('c');

    cache.set('stale', 'stale', 0);
    cache.set('fresh', 'fresh', 1_000);
    expect(cache.get('stale', 1_000)).toBeUndefined();
    expect(cache.get('b', 1_000)).toBeUndefined();
    expect(cache.get('fresh', 1_000)).toBe('fresh');
    expect(cache.size).toBe(1);
  });
});
