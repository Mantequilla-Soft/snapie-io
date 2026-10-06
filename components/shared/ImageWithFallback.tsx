'use client';
import { Box, Skeleton } from '@chakra-ui/react';
import NextImage, { type ImageLoader } from 'next/image';
import { memo, useEffect, useState } from 'react';
import { resolveFeedImageSrc } from '@/lib/images/feedImageSrc';
import { FEED_IMAGE_ASPECT_RATIO, classifyFeedMediaUrl, feedLcpImageUrl, shouldDeferNonPriorityMedia } from '@/lib/images/feedLcp';
import { DeferredMediaGate, useKnownHeavyMediaUrls } from '@/components/shared/DeferredFeedMedia';
import { scheduleAfterPriorityImage } from '@/lib/perf/afterPriorityImage';

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
 *
 * GIF and video files are the exception. They are never the priority image,
 * and an eager request still competes with that image on the critical
 * connection. Those stay a poster until play or a near-viewport scroll.
 *
 * Other first-viewport photos are the same kind of contention. On a pinned
 * mobile run the priority file was a few kilobytes, but sibling optimizer
 * requests on the same connection stretched its load from under a second
 * to several seconds. Those photos keep the 4/3 box and gain a src only
 * after the priority image has loaded. Below-fold cards are not in the
 * first HTML, so they still fetch when they mount.
 */
export const IMAGE_ASPECT_RATIO = FEED_IMAGE_ASPECT_RATIO;
const FEED_IMAGE_SIZES = '(max-width: 600px) 100vw, 540px';

/** True when the home priority photo is in the document and still downloading.
 *  Server render has no document, so this stays false there. */
function priorityPhotoStillLoading(): boolean {
  if (typeof document === 'undefined') return false;
  const img = document.querySelector('img[fetchpriority="high"]');
  return img instanceof HTMLImageElement && !img.complete;
}

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

const ImageWithFallback = memo(function ImageWithFallback({ url, alt, priority = false, painted = false }: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const knownHeavy = useKnownHeavyMediaUrls();
  const resolved = resolveFeedImageSrc(url);
  const defer = shouldDeferNonPriorityMedia(url, priority, knownHeavy);
  // Painted siblings are in the server HTML. The offscreen gate also mounts
  // further cards during hydration; those are not painted, but a w=750
  // request from them still shares the priority photo's connection.
  // Both wait. A page with no priority photo, and a card mounted after
  // that photo has finished, fetch immediately.
  const holdForPriority = !priority && !defer && (painted || priorityPhotoStillLoading());
  const [released, setReleased] = useState(!holdForPriority);
  useEffect(() => {
    if (!holdForPriority) return;
    return scheduleAfterPriorityImage(() => setReleased(true));
  }, [holdForPriority]);

  if (hasError || !resolved) {
    return <ImageFallback />;
  }

  // Playback uses the proxy (or the raw file for a video) and skips the
  // optimizer. The optimizer would fetch the whole GIF during the click,
  // and it would flatten the animation to one frame.
  if (defer) {
    const kind = classifyFeedMediaUrl(url);
    return (
      <DeferredMediaGate defer aspectRatio={IMAGE_ASPECT_RATIO}>
        <Box position="relative" aspectRatio={IMAGE_ASPECT_RATIO} width="100%">
          {kind === 'video' ? (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <NextImage
              src={resolved.src}
              alt={alt}
              fill
              sizes={FEED_IMAGE_SIZES}
              unoptimized
              loading="lazy"
              decoding="async"
              style={{ objectFit: 'cover' }}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
            />
          )}
        </Box>
      </DeferredMediaGate>
    );
  }

  // A first-viewport image has to paint from the server HTML. Opacity 0
  // until onLoad stays invisible until hydration, and a shimmer of the same
  // box can become the LCP element instead of the photo. Below-fold images
  // keep the fade. Only the first image is preloaded.
  if (holdForPriority && !released) {
    return (
      <Box
        position="relative"
        aspectRatio={IMAGE_ASPECT_RATIO}
        width="100%"
        bg="whiteAlpha.200"
        data-feed-image-held=""
      />
    );
  }

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
