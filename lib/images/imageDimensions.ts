/**
 * Width/height for post-body images. Hive markdown usually has no dimensions,
 * so the server reads them once from the image bytes while rendering a post
 * page and keeps the result in a short in-memory cache. Only images measured
 * within the render budget get dimensions; the rest render as before.
 *
 * Failures are cached as a miss so a dead URL is not retried on every render.
 * Unknown dimensions are never required — callers leave width/height off and
 * the image still renders.
 */
import sharp from 'sharp';
import { createBoundedTtlCache } from '@/lib/http/boundedTtlCache';
import { fetchProxiedImage, ImageProxyError } from '@/lib/images/imageProxy';
import {
  extractOriginalImageUrls,
  POST_IMAGE_PREFETCH_MAX,
  type ImageSize,
  type ImageSizeMap,
} from '@/lib/images/imageDimensions.shared';

export type { ImageSize, ImageSizeMap } from '@/lib/images/imageDimensions.shared';
export { extractOriginalImageUrls, originalUrlFromProxySrc } from '@/lib/images/imageDimensions.shared';

const HIT_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
/**
 * How long a post page render may wait for uncached image dimensions. Kept
 * short: this is time before the first byte. Downloads still running at the
 * deadline finish in the background, so a later visit hits the cache.
 */
export const PREFETCH_BUDGET_MS = 500;
/** At most this many uncached images are measured per render (the first ones in the post). */
export const SSR_PREFETCH_MAX = 6;

const inflight = new Map<string, Promise<ImageSize | null>>();

type CacheValue = ImageSize | null;

let cache = createBoundedTtlCache<CacheValue>({
  ttlMs: HIT_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

/** Tests only. */
export function resetImageDimensionCacheForTests(): void {
  inflight.clear();
  cache = createBoundedTtlCache<CacheValue>({
    ttlMs: HIT_TTL_MS,
    maxEntries: CACHE_MAX_ENTRIES,
  });
}

export async function measureImageBuffer(body: Buffer): Promise<ImageSize | null> {
  try {
    const meta = await sharp(body, { failOn: 'none' }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}

function peek(url: string): CacheValue | undefined {
  return cache.get(url);
}

function write(url: string, value: CacheValue, ttlMs: number): void {
  cache.set(url, value, Date.now() - (HIT_TTL_MS - ttlMs));
}

/**
 * Resolve width/height for a remote image URL, using the same SSRF-safe
 * fetch as `/api/image-proxy`. Cached hits are synchronous after the first
 * successful (or failed) lookup.
 */
export async function resolveImageDimensions(rawUrl: string): Promise<ImageSize | null> {
  const cached = peek(rawUrl);
  if (cached !== undefined) return cached;
  // Concurrent renders of the same post share one download.
  const running = inflight.get(rawUrl);
  if (running) return running;

  const task = (async (): Promise<ImageSize | null> => {
    try {
      const image = await fetchProxiedImage(rawUrl);
      const size = await measureImageBuffer(image.body);
      write(rawUrl, size, size ? HIT_TTL_MS : MISS_TTL_MS);
      return size;
    } catch (err) {
      if (err instanceof ImageProxyError) {
        write(rawUrl, null, MISS_TTL_MS);
        return null;
      }
      write(rawUrl, null, MISS_TTL_MS);
      return null;
    } finally {
      inflight.delete(rawUrl);
    }
  })();
  inflight.set(rawUrl, task);
  return task;
}

/**
 * Dimensions for the first few uncached images in `html`, waiting at most
 * `budgetMs`. The timer is always cleared. A download still running at the
 * deadline is not awaited; it finishes in the background (bounded by the
 * proxy's own timeout and size cap, and shared with any concurrent render)
 * so the next visit gets a cache hit instead of starting over.
 */
export async function prefetchPostImageDimensions(
  html: string,
  budgetMs: number = PREFETCH_BUDGET_MS,
): Promise<ImageSizeMap> {
  const urls = extractOriginalImageUrls(html).slice(0, POST_IMAGE_PREFETCH_MAX);
  const out: ImageSizeMap = {};
  const missing: string[] = [];
  for (const url of urls) {
    const hit = peek(url);
    if (hit) out[url] = hit;
    else if (hit === undefined && missing.length < SSR_PREFETCH_MAX) missing.push(url);
  }
  if (missing.length === 0 || budgetMs <= 0) return out;

  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, budgetMs);
  });
  const work = Promise.all(
    missing.map(async (url) => {
      const size = await resolveImageDimensions(url);
      if (size && !expired) out[url] = size;
    }),
  );
  try {
    await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
  // Return a copy so late background results cannot change what was rendered.
  return { ...out };
}
