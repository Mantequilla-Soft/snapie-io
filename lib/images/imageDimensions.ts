/**
 * Width/height for post-body images. Hive markdown usually has no dimensions,
 * so the server (or the proxy `meta=1` endpoint) reads them once from the
 * image bytes and keeps the result in a short in-memory cache.
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
export { extractOriginalImageUrls, originalUrlFromProxySrc, fetchImageDimensionsFromProxy } from '@/lib/images/imageDimensions.shared';

const HIT_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
const PREFETCH_BUDGET_MS = 1_500;

type CacheValue = ImageSize | null;

let cache = createBoundedTtlCache<CacheValue>({
  ttlMs: HIT_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

/** Tests only. */
export function resetImageDimensionCacheForTests(): void {
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
  }
}

export async function prefetchPostImageDimensions(html: string): Promise<ImageSizeMap> {
  const urls = extractOriginalImageUrls(html).slice(0, POST_IMAGE_PREFETCH_MAX);
  const out: ImageSizeMap = {};
  const missing: string[] = [];
  for (const url of urls) {
    const hit = peek(url);
    if (hit) out[url] = hit;
    else if (hit === undefined) missing.push(url);
  }
  if (missing.length === 0) return out;

  const deadline = Date.now() + PREFETCH_BUDGET_MS;
  await Promise.all(
    missing.map(async (url) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const size = await Promise.race([
        resolveImageDimensions(url),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
      ]);
      if (size) out[url] = size;
    }),
  );
  return out;
}
