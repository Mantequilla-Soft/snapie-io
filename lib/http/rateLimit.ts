import { isIP } from 'node:net';

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Address to key a per-visitor limiter on.
 *
 * Production is behind Cloudflare, which sets `cf-connecting-ip` to the
 * visitor. That is the only header trusted here. nginx appends to
 * `x-forwarded-for`, so the first entry is chosen by the client: rotating
 * it would mint a new bucket on every request. When the Cloudflare header
 * is missing or not a single IP, every such request shares one bucket.
 *
 * `/api/image-proxy` can call this with its own map.
 */
export function trustedClientIp(headers: Headers): string {
  const candidate = headers.get('cf-connecting-ip')?.trim() ?? '';
  if (candidate !== '' && isIP(candidate) !== 0) return candidate;
  return 'unknown';
}

/**
 * Fixed-window limiter. `true` means the request is allowed.
 * Expired buckets are dropped on each check so a rotating key cannot
 * grow the map without bound; live entries are still capped by the window.
 */
export function checkRateLimit(
  buckets: Map<string, RateLimitEntry>,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  for (const [bucketKey, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(bucketKey);
  }

  const entry = buckets.get(key);
  if (!entry) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
