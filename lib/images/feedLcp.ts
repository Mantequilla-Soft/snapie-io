import { separateContent } from '@/lib/utils/snapUtils';
import { resolveFeedImageSrc } from '@/lib/images/feedImageSrc';

/**
 * Home-feed LCP image URL.
 *
 * The optimizer (`/_next/image`) re-encodes the same-origin proxy response
 * as AVIF or WebP. Width is fixed at 640: Lighthouse mobile is 412 CSS px
 * at 1.75x, so a full-viewport `100vw` candidate rounds up to 750, and a
 * 2x srcset of a 640-wide slot rounds up to 1280. 640 is enough for the
 * feed column (~360–540 CSS px) and is the smallest default device size
 * that still covers that slot.
 */
export const FEED_LCP_WIDTH = 640;

export function feedLcpImageUrl(src: string, quality = 75): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${FEED_LCP_WIDTH}&q=${quality}`;
}

const MARKDOWN_IMAGE = /!\[[^\]]*]\([^)]*\)/;
const MARKDOWN_IMAGE_URL = /!\[[^\]]*]\(\s*([^)\s]+)\s*\)/g;

/**
 * Upstream bytes above this are not the home LCP candidate.
 * 300 KB (300_000 bytes) sits at the top of the 200–300 KB budget: a
 * 640px jpeg/png/webp/avif photo usually fits, and a multi-megabyte GIF
 * does not. The check is HEAD Content-Length on the original URL. A
 * missing length does not reject a known photo extension.
 */
export const LCP_MEDIA_SIZE_CAP_BYTES = 300_000;

const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif']);
const GIF_EXTENSIONS = new Set(['gif']);
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'm4v', 'webm', 'mov', 'ogv', 'ogg', 'm3u8', 'gifv', 'm4s',
]);

export type LcpMediaKind = 'photo' | 'gif' | 'video' | 'unknown';

export interface LcpImageProbe {
  contentType: string | null;
  contentLength: number | null;
}

export interface FirstScreenLcpImage {
  /** Markdown target, before the image proxy. */
  rawUrl: string;
  /** Same-origin proxy path passed to next/image. */
  src: string;
  /** `/_next/image` URL to preload. */
  optimizerUrl: string;
  bodyIndex: number;
}

/** True when the media block contains at least one markdown image. */
export function hasMarkdownImage(media: string): boolean {
  return MARKDOWN_IMAGE.test(media);
}

/** Path extension, ignoring query and fragment. `file.GIF` is `gif`. */
export function feedMediaExtension(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  let path = trimmed.split('#')[0];
  try {
    path = new URL(trimmed).pathname;
  } catch {
    path = path.split('?')[0];
  }
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
}

/**
 * Photo means jpeg/png/webp/avif. A declared content-type wins over the
 * extension when it is a known image or video type, so a `.jpg` that is
 * actually `image/gif` is still a GIF.
 */
export function classifyFeedMediaUrl(rawUrl: string, contentType?: string | null): LcpMediaKind {
  if (contentType) {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (mime === 'image/gif') return 'gif';
    if (mime.startsWith('video/')) return 'video';
    if (
      mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/pjpeg' ||
      mime === 'image/png' || mime === 'image/webp' || mime === 'image/avif'
    ) {
      return 'photo';
    }
  }
  const ext = feedMediaExtension(rawUrl);
  if (!ext) return 'unknown';
  if (GIF_EXTENSIONS.has(ext)) return 'gif';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (PHOTO_EXTENSIONS.has(ext)) return 'photo';
  return 'unknown';
}

export function isOverLcpSizeCap(contentLength: number | null | undefined): boolean {
  return typeof contentLength === 'number' && Number.isFinite(contentLength) && contentLength > LCP_MEDIA_SIZE_CAP_BYTES;
}

/** GIF and video extensions are rejected without a network probe. */
export function lcpCandidateNeedsProbe(rawUrl: string): boolean {
  const kind = classifyFeedMediaUrl(rawUrl);
  return kind !== 'gif' && kind !== 'video';
}

/**
 * Suitable LCP media is a photo at or under the size cap.
 * A known photo extension survives a failed probe. An extensionless URL
 * (IPFS, no `.jpg`) is suitable only when the probe reports a photo type
 * and the length is missing or under the cap.
 */
const GENERIC_MIME = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/binary',
]);

export function isSuitableLcpCandidate(rawUrl: string, probe: LcpImageProbe | null): boolean {
  const extKind = classifyFeedMediaUrl(rawUrl);
  if (extKind === 'gif' || extKind === 'video') return false;
  const kind = probe?.contentType ? classifyFeedMediaUrl(rawUrl, probe.contentType) : extKind;
  if (kind === 'gif' || kind === 'video') return false;
  if (isOverLcpSizeCap(probe?.contentLength)) return false;
  if (kind === 'photo') return true;
  // Extensionless URL whose server did not name an image type. Accept only
  // when Content-Length proves it is inside the cap, so a huge unnamed GIF
  // is not preloaded and a small IPFS photo still can be.
  if (extKind !== 'unknown' || !probe || probe.contentLength == null || probe.contentLength <= 0) return false;
  const mime = probe.contentType?.split(';')[0].trim().toLowerCase() ?? '';
  return mime === '' || GENERIC_MIME.has(mime);
}

/** Plain markdown images only. Video and iframe markup size themselves.
 *  A photo whose URL is on ipfs.3speak.tv is still a photo: the embed check
 *  looks at the text left after image markdown is removed. */
export function isPlainFeedImageMedia(media: string): boolean {
  if (!hasMarkdownImage(media)) return false;
  const withoutImages = media.replace(/!\[[^\]]*]\([^)]*\)/g, '');
  return !/3speak\.tv|youtube\.com|youtu\.be|instagram\.com|<iframe/i.test(withoutImages);
}

/** True when the media block also has a non-image line (embed URL, iframe). */
export function mediaHasEmbed(media: string): boolean {
  return media.split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !/^!\[[^\]]*]\([^)]*\)$/.test(trimmed);
  });
}

function markdownImageUrls(media: string): string[] {
  const urls: string[] = [];
  const re = new RegExp(MARKDOWN_IMAGE_URL.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(media)) !== null) urls.push(match[1]);
  return urls;
}

/** First visible image. Later images in the same run are carousel slides. */
export function firstVisibleFeedImageUrl(media: string): string | null {
  return markdownImageUrls(media)[0] ?? null;
}

export function bodyHasMarkdownImageUrl(body: string, rawUrl: string): boolean {
  const { media } = separateContent(body);
  return markdownImageUrls(media).includes(rawUrl);
}

/**
 * One candidate per snap: the image that actually paints (carousel slide 0).
 * Cards whose media is a video embed are omitted; their thumbnail is not
 * the thing Lighthouse will wait on.
 */
export function listFirstScreenLcpCandidates(bodies: Array<string | null | undefined>): FirstScreenLcpImage[] {
  const candidates: FirstScreenLcpImage[] = [];
  bodies.forEach((body, bodyIndex) => {
    if (!body) return;
    const { media } = separateContent(body);
    if (!isPlainFeedImageMedia(media)) return;
    const rawUrl = firstVisibleFeedImageUrl(media);
    if (!rawUrl) return;
    const resolved = resolveFeedImageSrc(rawUrl);
    if (!resolved || resolved.unoptimized) return;
    candidates.push({
      rawUrl,
      src: resolved.src,
      optimizerUrl: feedLcpImageUrl(resolved.src),
      bodyIndex,
    });
  });
  return candidates;
}

/**
 * Extension-only pick. Skips GIF and video. Used when the server did not
 * supply a choice (client-only feeds). Does not apply the byte cap.
 */
export function selectFirstScreenLcpImageSync(
  bodies: Array<string | null | undefined>,
): FirstScreenLcpImage | null {
  for (const candidate of listFirstScreenLcpCandidates(bodies)) {
    const kind = classifyFeedMediaUrl(candidate.rawUrl);
    if (kind === 'gif' || kind === 'video') continue;
    return candidate;
  }
  return null;
}

/**
 * Server pick. Probes every candidate that is not already a GIF or video,
 * then walks in order. The first suitable photo wins.
 */
export async function selectFirstScreenLcpImage(
  bodies: Array<string | null | undefined>,
  probe: (rawUrl: string) => Promise<LcpImageProbe | null>,
): Promise<FirstScreenLcpImage | null> {
  const candidates = listFirstScreenLcpCandidates(bodies);
  const metas = await Promise.all(candidates.map(async (candidate) => {
    if (!lcpCandidateNeedsProbe(candidate.rawUrl)) return null;
    try {
      return await probe(candidate.rawUrl);
    } catch {
      return null;
    }
  }));
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (isSuitableLcpCandidate(candidate.rawUrl, metas[i])) {
      return candidate;
    }
  }
  return null;
}

/**
 * Which image, if any, gets `priority` / fetchpriority=high.
 * `null` means the server already decided nothing in this screen is suitable
 * (oversized photo, GIF, video) and the client must not fall back to it.
 */
export function paintedPriorityImageUrl(
  bodies: Array<string | null | undefined>,
  paintedCount: number,
  serverChoice?: string | null,
): string | null {
  const limit = Math.max(paintedCount, 1);
  const slice = bodies.slice(0, limit);
  if (serverChoice === null) return null;
  if (typeof serverChoice === 'string' && slice.some((body) => bodyHasMarkdownImageUrl(body || '', serverChoice))) {
    return serverChoice;
  }
  return selectFirstScreenLcpImageSync(slice)?.rawUrl ?? null;
}

/**
 * Optimizer URL for the first suitable image on one card, or null when that
 * card has no plain photo. GIF and video markdown are not returned.
 */
export function homeFeedLcpImageUrl(body: string | null | undefined): string | null {
  return selectFirstScreenLcpImageSync(body ? [body] : [])?.optimizerUrl ?? null;
}

/** First suitable photo among the server-painted snaps. Card 0 is often
 *  text or a GIF; the next card's photo is then the priority image. */
export function firstScreenLcpImageUrl(bodies: Array<string | null | undefined>): string | null {
  return selectFirstScreenLcpImageSync(bodies)?.optimizerUrl ?? null;
}
