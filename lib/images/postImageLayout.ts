/**
 * Responsive attributes for images inside rendered post HTML.
 *
 * - `srcset` / `sizes` point at `/api/image-proxy?url=…&w=` so phones can
 *   download a smaller file. Animated GIFs are left as a single src.
 * - `width` / `height` (and `aspect-ratio`) are added when dimensions are
 *   known, so the browser can reserve space. Missing dimensions are fine:
 *   the image still renders and CSS keeps `max-width: 100%; height: auto`.
 * - Hivemoji images are left alone (they are sized in ems).
 */
import { IMAGE_PROXY_PATH } from '@/lib/images/feedImageSrc';
import {
  originalUrlFromProxySrc,
  type ImageSize,
  type ImageSizeMap,
} from '@/lib/images/imageDimensions';

export const POST_IMAGE_SRCSET_WIDTHS = [320, 640, 960, 1280] as const;
export const POST_IMAGE_SIZES = '(max-width: 768px) 100vw, 720px';

const IMG_TAG = /<img\b[^>]*>/gi;

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(tag);
  return match ? match[2] : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function classList(tag: string): string[] {
  return (attr(tag, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function isHivemoji(tag: string): boolean {
  return classList(tag).some((name) => name.includes('hivemoji'));
}

function isGifSrc(src: string, original: string | null): boolean {
  const candidate = original ?? src;
  return /\.gif(?:$|\?)/i.test(candidate);
}

function isProxySrc(src: string): boolean {
  try {
    const url = new URL(src, 'https://snapie.invalid');
    return url.pathname === IMAGE_PROXY_PATH && url.searchParams.has('url');
  } catch {
    return false;
  }
}

export function proxySrcWithWidth(src: string, width: number): string {
  const url = new URL(src, 'https://snapie.invalid');
  url.searchParams.set('w', String(width));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function srcsetFor(src: string, intrinsicWidth?: number): string {
  const widths = POST_IMAGE_SRCSET_WIDTHS.filter((width) => !intrinsicWidth || width <= intrinsicWidth);
  const list = widths.length > 0 ? widths : [POST_IMAGE_SRCSET_WIDTHS[0]];
  return list.map((width) => `${escapeAttr(proxySrcWithWidth(src, width))} ${width}w`).join(', ');
}

function lookupSize(src: string, original: string | null, sizes?: ImageSizeMap | null): ImageSize | undefined {
  if (!sizes) return undefined;
  if (original && sizes[original]) return sizes[original];
  if (sizes[src]) return sizes[src];
  return undefined;
}

function enhanceTag(tag: string, sizes?: ImageSizeMap | null): string {
  if (isHivemoji(tag)) return tag;
  const rawSrc = attr(tag, 'src');
  if (!rawSrc) return tag;
  const src = decodeHtml(rawSrc);
  const original = originalUrlFromProxySrc(src);
  const dims = lookupSize(src, original, sizes);
  const selfClosing = /\/\s*>$/.test(tag);
  let core = tag.replace(/\/\s*>$/, '>').slice(0, -1);
  const extras: string[] = [];

  if (isProxySrc(src) && !isGifSrc(src, original) && !attr(tag, 'srcset')) {
    extras.push(`srcset="${srcsetFor(src, dims?.width)}"`);
    if (!attr(tag, 'sizes')) extras.push(`sizes="${POST_IMAGE_SIZES}"`);
  }

  if (dims && !attr(tag, 'width')) {
    extras.push(`width="${dims.width}"`);
    extras.push(`height="${dims.height}"`);
    const aspect = `aspect-ratio:${dims.width}/${dims.height}`;
    const style = attr(tag, 'style');
    if (style && !/aspect-ratio/i.test(style)) {
      const next = `${style.trim().replace(/;?$/, ';')}${aspect}`;
      core = core.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i, ` style=$1${next}$1`);
    } else if (!style) {
      extras.push(`style="${aspect}"`);
    }
  }

  if (extras.length === 0 && core + '>' === (selfClosing ? tag.replace(/\/\s*>$/, '>') : tag)) {
    return tag;
  }
  return `${core}${extras.length ? ` ${extras.join(' ')}` : ''}${selfClosing ? ' />' : '>'}`;
}

/**
 * Add srcset/sizes to proxied content images, and width/height when known.
 */
export function applyPostImageLayout(html: string, sizes?: ImageSizeMap | null): string {
  return html.replace(IMG_TAG, (tag) => enhanceTag(tag, sizes));
}
