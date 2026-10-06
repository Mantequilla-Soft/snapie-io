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

/** True when the media block contains at least one markdown image. */
export function hasMarkdownImage(media: string): boolean {
  return MARKDOWN_IMAGE.test(media);
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
