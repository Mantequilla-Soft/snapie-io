'use client';
import { Box, Skeleton } from '@chakra-ui/react';
import NextImage from 'next/image';
import { memo, useState } from 'react';
import { resolveFeedImageSrc } from '@/lib/images/feedImageSrc';

interface ImageWithFallbackProps {
  url: string;
  alt: string;
}

/**
 * A failed image load (dead link, expired CDN URL, or a browser/ad-blocker
 * silently refusing the request — e.g. Twitter's "amplify_video_thumb"
 * thumbnails commonly get filtered by ad-blocklists since they're part of
 * Twitter's ad product) used to just vanish: onError set display:none with
 * no fallback UI at all, so there was no way to tell a broken image from a
 * post that never had one. It now keeps a neutral tile in the same box.
 * Shared by MediaRenderer (single image) and ImageCarousel (multiple
 * images) so both fail the same way.
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
const IMAGE_ASPECT_RATIO = 4 / 3;
const FEED_IMAGE_SIZES = '(max-width: 600px) 100vw, 540px';

/** Neutral tile in the same 4/3 box. No `<img>`, so a dead file does not
 *  flash the browser's broken-image icon or change the card height. */
function ImageFallback() {
  return (
    <Box
      aspectRatio={IMAGE_ASPECT_RATIO}
      width="100%"
      bg="whiteAlpha.200"
      role="img"
      aria-label="Image unavailable"
      data-image-fallback=""
    />
  );
}

const ImageWithFallback = memo(function ImageWithFallback({ url, alt }: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const resolved = resolveFeedImageSrc(url);

  if (hasError || !resolved) {
    return <ImageFallback />;
  }

  return (
    <Box position="relative" aspectRatio={IMAGE_ASPECT_RATIO} width="100%">
      {/* Shimmer while the image downloads — the fixed-aspect box otherwise
          sits blank with no hint anything is happening, which on mobile
          bandwidth reads as the feed being stuck rather than loading. */}
      {!isLoaded && <Skeleton position="absolute" inset={0} speed={0.9} />}
      <NextImage
        src={resolved.src}
        alt={alt}
        fill
        sizes={FEED_IMAGE_SIZES}
        loading="eager"
        unoptimized={resolved.unoptimized}
        style={{
          objectFit: 'cover',
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.15s ease-out',
        }}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </Box>
  );
});

export default ImageWithFallback;
