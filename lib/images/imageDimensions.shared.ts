/**
 * Browser-safe image-dimension helpers. Do not import the server module
 * (`imageDimensions.ts`) from client components — it pulls in sharp and the
 * proxy's Node SSRF stack.
 */
import { IMAGE_PROXY_PATH } from '@/lib/images/feedImageSrc';

export type ImageSize = { width: number; height: number };
export type ImageSizeMap = Record<string, ImageSize>;

export const POST_IMAGE_PREFETCH_MAX = 12;

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
 * Ask the same-origin proxy for cached or freshly measured dimensions.
 * Used when the post was loaded on the client without a server-provided map.
 */
export async function fetchImageDimensionsFromProxy(originalUrls: string[]): Promise<ImageSizeMap> {
  const out: ImageSizeMap = {};
  await Promise.all(
    originalUrls.slice(0, POST_IMAGE_PREFETCH_MAX).map(async (url) => {
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
