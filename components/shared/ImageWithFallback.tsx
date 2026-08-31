'use client';
import { Box, Image, Link, Skeleton, Text } from '@chakra-ui/react';
import { memo, useState } from 'react';

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
 */
const IMAGE_ASPECT_RATIO = 4 / 3;

const ImageWithFallback = memo(function ImageWithFallback({ url, alt }: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (hasError) {
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
      </Box>
    );
  }

  return (
    <Box position="relative" aspectRatio={IMAGE_ASPECT_RATIO} width="100%">
      {/* Shimmer while the image downloads — the fixed-aspect box otherwise
          sits blank with no hint anything is happening, which on mobile
          bandwidth reads as the feed being stuck rather than loading. */}
      {!isLoaded && <Skeleton position="absolute" inset={0} speed={0.9} />}
      {/* No loading="lazy": SnapList's virtualization already bounds how
          many cards (and thus images) exist at once, and Virtuoso mounts
          cards ~3500px ahead of the viewport — further out than the
          browser's own lazy-load threshold, so lazy was delaying the fetch
          until the user was nearly on top of the image. Eager lets the
          download start the moment the card mounts, using the scroll
          runway as preload time; the browser still deprioritizes
          offscreen fetches on its own. */}
      <Image
        src={url}
        alt={alt}
        width="100%"
        height="100%"
        objectFit="cover"
        display="block"
        opacity={isLoaded ? 1 : 0}
        transition="opacity 0.15s ease-out"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        // A remount of an already-cached image (scroll back up through the
        // virtualized list) can have `complete` true before onLoad wires
        // up — without this check the shimmer covers an image that's
        // already there.
        ref={(el) => { if (el?.complete && el.naturalWidth > 0 && !isLoaded) setIsLoaded(true); }}
      />
    </Box>
  );
});

export default ImageWithFallback;
