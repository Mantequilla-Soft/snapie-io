'use client';
import { Box, Link, Skeleton, Text } from '@chakra-ui/react';
import NextImage, { type ImageLoader } from 'next/image';
import { memo, useState } from 'react';
import { resolveFeedImageSrc } from '@/lib/images/feedImageSrc';
import { feedLcpImageUrl } from '@/lib/images/feedLcp';

interface ImageWithFallbackProps {
  url: string;
  alt: string;
  /** First feed image. Visible in the server HTML, preloaded, fixed 640px. */
  priority?: boolean;
  /** Other first-viewport images. In the HTML at 640px, no fade, not preloaded. */
  painted?: boolean;
}

const feedLcpLoader: ImageLoader = ({ src, quality }) => feedLcpImageUrl(src, quality);

/**
 * A failed image load (dead link, expired CDN URL, or a browser/ad-blocker
 * silently refusing the request — e.g. Twitter's "amplify_video_thumb"
 * thumbnails commonly get filtered by ad-blocklists since they're part of
 * Twitter's ad product) used to just vanish: onError set display:none with
 * no fallback UI at all, so there was no way to tell a broken image from a
 * post that never had one. Same "give the user a way to open it directly"
 * pattern MediaRenderer's IframeEmbedBox already uses for blocked embeds,
 * applied to plain images. Shared by MediaRenderer (single image) and
 * ImageCarousel (multiple images) so both fail the same way.
 *
 * Fixed aspect-ratio box (design decision, not a real dimension): the old
 * width=100%/maxH=480px/height=auto layout left the box's height unknown
 * until the image itself finished loading, then resolved to whatever the
 * image's natural ratio dictated. Harmless for a page that mounts once, but
 * SnapList's Virtuoso virtualization (see SnapList.tsx) remounts a card
 * every time it re-enters the scroll window — so that same load-then-jump
 * was repeating on every scroll-back, forcing Virtuoso to re-measure the
 * item and shift everything below it mid-gesture. Locking the box to a
 * constant aspect-ratio up front means its height is known before the image
 * ever starts loading, so there is nothing left to jump. objectFit="cover"
 * crops to fill it instead of letter-boxing.
 *
 * The bytes come through `next/image`. Remote user-content URLs are rewritten
 * to `/api/image-proxy` (same origin) so the optimizer does not need a
 * wildcard remotePatterns entry. `loading="eager"` keeps the previous
 * behavior: SnapList's virtualization already bounds how many cards exist,
 * and Virtuoso mounts cards ~3500px ahead of the viewport — further out than
 * the browser's own lazy-load threshold, so lazy was delaying the fetch
 * until the user was nearly on top of the image. Eager lets the download
 * start the moment the card mounts. next/image also covers the cached-image
 * case (a remount where `complete` is already true) that used to need a
 * manual ref check.
 */
export const IMAGE_ASPECT_RATIO = 4 / 3;
const FEED_IMAGE_SIZES = '(max-width: 600px) 100vw, 540px';

function canOpenDirectly(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function ImageFallback({ url }: { url: string }) {
  return (
    <Box
      aspectRatio={IMAGE_ASPECT_RATIO}
      bg="blackAlpha.700"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      px={4}
      textAlign="center"
      gap={2}
    >
      <Text fontSize="sm" color="whiteAlpha.900">
        Image failed to load.
      </Text>
      {canOpenDirectly(url) && (
        <Link
          href={url}
          isExternal
          color="blue.200"
          textDecoration="underline"
          fontWeight="semibold"
          fontSize="sm"
          onClick={(e) => e.stopPropagation()}
        >
          Open image directly
        </Link>
      )}
    </Box>
  );
}

const ImageWithFallback = memo(function ImageWithFallback({ url, alt, priority = false, painted = false }: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const resolved = resolveFeedImageSrc(url);

  if (hasError || !resolved) {
    return <ImageFallback url={url} />;
  }

  // A first-viewport image has to paint from the server HTML. Opacity 0
  // until onLoad stays invisible until hydration, and a shimmer of the same
  // box can become the LCP element instead of the photo. Below-fold images
  // keep the fade. Only the first image is preloaded.
  const immediate = priority || painted;
  const hiddenUntilLoad = !immediate;

  return (
    <Box position="relative" aspectRatio={IMAGE_ASPECT_RATIO} width="100%">
      {hiddenUntilLoad && !isLoaded && <Skeleton position="absolute" inset={0} speed={0.9} />}
      <NextImage
        src={resolved.src}
        alt={alt}
        fill
        sizes={FEED_IMAGE_SIZES}
        loader={immediate && !resolved.unoptimized ? feedLcpLoader : undefined}
        priority={priority}
        loading={priority ? undefined : 'eager'}
        decoding={priority ? 'sync' : 'async'}
        unoptimized={resolved.unoptimized}
        style={{
          objectFit: 'cover',
          ...(hiddenUntilLoad
            ? { opacity: isLoaded ? 1 : 0, transition: 'opacity 0.15s ease-out' }
            : null),
        }}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </Box>
  );
});

export default ImageWithFallback;
