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

/** Width/height reserved for a plain feed photo. Matches ImageWithFallback. */
export const FEED_IMAGE_ASPECT_RATIO = 4 / 3;

/**
 * Aspect ratio (width / height) to reserve before a media slot mounts.
 * Images use the feed tile. Horizontal embeds use 16/9. Audio and tweets
 * size themselves in pixels, so they are left unset — a wrong ratio would
 * move the card when the real player mounts.
 */
export function feedMediaSlotAspect(media: string): number | undefined {
  if (isPlainFeedImageMedia(media)) return FEED_IMAGE_ASPECT_RATIO;
  if (/audio\.3speak\.tv/i.test(media)) return undefined;
  if (/platform\.twitter\.com|twitter\.com|x\.com/i.test(media)) return undefined;
  if (/instagram\.com/i.test(media)) return 4 / 5;
  if (/\/shorts\/|youtube\.com\/shorts/i.test(media)) return 9 / 16;
  if (/youtube\.com|youtu\.be|3speak\.tv|<iframe|player\.vimeo|dailymotion|odysee\.com|rumble\.com/i.test(media)) {
    return 16 / 9;
  }
  return undefined;
}

/** True when the media block also has a non-image line (embed URL, iframe). */
export function mediaHasEmbed(media: string): boolean {
  return media.split('\n').some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !/^!\[[^\]]*]\([^)]*\)$/.test(trimmed);
  });
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

/** First plain image among the server-painted snaps. Card 0 is often text;
 *  the next card's photo is then the largest thing in the first viewport. */
export function firstScreenLcpImageUrl(bodies: Array<string | null | undefined>): string | null {
  for (const body of bodies) {
    const url = homeFeedLcpImageUrl(body);
    if (url) return url;
  }
  return null;
}
