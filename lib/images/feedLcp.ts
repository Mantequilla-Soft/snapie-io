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

/** Plain markdown images only. Video and iframe markup size themselves. */
export function isPlainFeedImageMedia(media: string): boolean {
  if (!/!\[.*?\]\(.*?\)/.test(media)) return false;
  return !/3speak\.tv|youtube\.com|youtu\.be|instagram\.com|<iframe/i.test(media);
}

/**
 * Optimizer URL for the first card's first image, or null when that card
 * has no plain image. The page preloads this from the server so the
 * request is in the initial HTML, not after hydration.
 */
export function homeFeedLcpImageUrl(body: string | null | undefined): string | null {
  if (!body) return null;
  const { media } = separateContent(body);
  if (!isPlainFeedImageMedia(media)) return null;
  const match = /!\[[^\]]*]\(\s*([^)\s]+)\s*\)/.exec(media);
  if (!match) return null;
  const resolved = resolveFeedImageSrc(match[1]);
  if (!resolved || resolved.unoptimized) return null;
  return feedLcpImageUrl(resolved.src);
}
