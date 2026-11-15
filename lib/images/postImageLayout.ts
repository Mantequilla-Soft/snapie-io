/**
 * Responsive attributes for images inside rendered post HTML.
 *
 * - Only when an image's dimensions are known: `width` / `height` (and
 *   `aspect-ratio`) so the browser reserves space, plus `srcset` / `sizes`
 *   pointing at `/api/image-proxy?url=…&w=` so phones download a smaller file.
 *   The `width` attribute pins the display size, so a narrow descriptor can
 *   never make the image render smaller than it really is.
 * - Unknown dimensions: the tag is left alone. With `w` descriptors and no
 *   width, the browser would scale the image by sizes ÷ descriptor, and the
 *   proxy never upscales, so a 500px screenshot would show at ~281px.
 * - Animated GIFs (by URL) and hivemoji (sized in ems) are left alone. The
 *   proxy also skips resizing any animated image (WebP/APNG) it receives.
 * - Only callers that pass a dimensions map (the post detail column) get any
 *   of this, so Snaps, replies and compose previews are untouched.
 */
import { IMAGE_PROXY_PATH } from '@/lib/images/feedImageSrc';
import {
  originalUrlFromProxySrc,
  type ImageSize,
  type ImageSizeMap,
} from '@/lib/images/imageDimensions.shared';

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

/**
 * Downscaled proxy widths below the intrinsic width, plus the unresized src
 * at its real width. Null when there is nothing smaller to offer.
 */
function srcsetFor(src: string, intrinsicWidth: number): string | null {
  const widths = POST_IMAGE_SRCSET_WIDTHS.filter((width) => width < intrinsicWidth);
  if (widths.length === 0) return null;
  const list = widths.map((width) => `${escapeAttr(proxySrcWithWidth(src, width))} ${width}w`);
  list.push(`${escapeAttr(src)} ${intrinsicWidth}w`);
  return list.join(', ');
}

function lookupSize(src: string, original: string | null, sizes?: ImageSizeMap | null): ImageSize | undefined {
  if (!sizes) return undefined;
  if (original && sizes[original]) return sizes[original];
  if (sizes[src]) return sizes[src];
  return undefined;
}

function enhanceTag(tag: string, sizes: ImageSizeMap | null | undefined, sizesAttr: string): string {
  if (isHivemoji(tag)) return tag;
  const rawSrc = attr(tag, 'src');
  if (!rawSrc) return tag;
  const src = decodeHtml(rawSrc);
  const original = originalUrlFromProxySrc(src);
  const dims = lookupSize(src, original, sizes);
  const selfClosing = /\/\s*>$/.test(tag);
  let core = tag.replace(/\/\s*>$/, '>').slice(0, -1);
  const extras: string[] = [];

  // srcset only together with a width we set ourselves; see the file comment.
  const pinsWidth = Boolean(dims) && !attr(tag, 'width');
  if (pinsWidth && dims && isProxySrc(src) && !isGifSrc(src, original) && !attr(tag, 'srcset')) {
    const srcset = srcsetFor(src, dims.width);
    if (srcset) {
      extras.push(`srcset="${srcset}"`);
      if (!attr(tag, 'sizes')) extras.push(`sizes="${escapeAttr(sizesAttr)}"`);
    }
  }

  if (pinsWidth && dims) {
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
 * Add width/height, and srcset/sizes for proxied images, to content images
 * whose dimensions are in `sizes`. Without a map the HTML is returned as is.
 * `sizesAttr` is the layout width hint; it defaults to the post column.
 */
export function applyPostImageLayout(
  html: string,
  sizes?: ImageSizeMap | null,
  sizesAttr: string = POST_IMAGE_SIZES,
): string {
  if (!sizes || Object.keys(sizes).length === 0) return html;
  return html.replace(IMG_TAG, (tag) => enhanceTag(tag, sizes, sizesAttr));
}
