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
import { IMAGE_PROXY_PATH } from '@/lib/images/feedImageSrc';

export type ImageSize = { width: number; height: number };
export type ImageSizeMap = Record<string, ImageSize>;

const HIT_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
const PREFETCH_BUDGET_MS = 1_500;
const PREFETCH_MAX_IMAGES = 12;

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

export function originalUrlFromProxySrc(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, 'https://snapie.invalid');
    if (url.pathname !== IMAGE_PROXY_PATH) return null;
    const original = url.searchParams.get('url');
    return original && original.length > 0 ? original : null;
  } catch {
    return null;
  }
}

const IMG_TAG = /<img\b[^>]*>/gi;

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(tag);
  return match ? match[2] : null;
}

function classList(tag: string): string[] {
  return (attr(tag, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * Upstream image URLs from proxied post-body `<img>` tags, excluding hivemoji.
 */
export function extractOriginalImageUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const tag of html.match(IMG_TAG) ?? []) {
    if (classList(tag).some((name) => name.includes('hivemoji'))) continue;
    const src = attr(tag, 'src');
    if (!src) continue;
    const original = originalUrlFromProxySrc(decodeHtml(src));
    if (!original || seen.has(original)) continue;
    seen.add(original);
    urls.push(original);
  }
  return urls;
}

/**
 * Fill width/height for images in already-rendered post HTML.
 * Time-boxed so a slow first visit cannot stall the post page.
 */
export async function prefetchPostImageDimensions(html: string): Promise<ImageSizeMap> {
  const urls = extractOriginalImageUrls(html).slice(0, PREFETCH_MAX_IMAGES);
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

/**
 * Browser helper: ask the same-origin proxy for cached or freshly measured
 * dimensions. Used when the post was loaded on the client without a
 * server-provided map.
 */
export async function fetchImageDimensionsFromProxy(originalUrls: string[]): Promise<ImageSizeMap> {
  const out: ImageSizeMap = {};
  await Promise.all(
    originalUrls.slice(0, PREFETCH_MAX_IMAGES).map(async (url) => {
      try {
        const res = await fetch(
          `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(url)}&meta=1`,
          { credentials: 'same-origin' },
        );
        const data = (await res.json().catch(() => null)) as
          | { ok?: unknown; width?: unknown; height?: unknown }
          | null;
        const width = typeof data?.width === 'number' ? data.width : NaN;
        const height = typeof data?.height === 'number' ? data.height : NaN;
        if (data?.ok === true && width >= 1 && height >= 1) {
          out[url] = { width, height };
        }
      } catch {
        // Leave the entry missing; the image still renders without dimensions.
      }
    }),
  );
  return out;
}
