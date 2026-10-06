'use client';
import { Box, BoxProps } from '@chakra-ui/react';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { findClipScroller } from '@/lib/dom/scrollParent';

/**
 * Unmounts children that are far from the visible scrollport and remounts
 * them as they approach. Two call sites, two margins — see SnapList.tsx
 * (whole card) and Snap.tsx (just the media).
 *
 * The observer root is the clipping scroll parent, not the viewport.
 * `rootMargin` does not extend through an ancestor that clips, so a
 * viewport root only fires once the card is already on screen. Mounting
 * there changes height under the user's eyes. A margin against the real
 * scrollport lets the card reach its final height while it is still below
 * the fold.
 *
 * `content-visibility: auto` is intentionally not applied here. Skipping
 * a card's descendants drops their boxes (the browser reports a move to
 * 0×0) even when `contain-intrinsic-size` holds the parent, and that
 * move is a layout shift for every card that enters the viewport.
 *
 * Placeholders keep the last measured height. `keepMounted` leaves a card
 * in the tree after the first time it comes near, so a later scroll-back
 * does not rebuild it from the placeholder.
 */
interface OffscreenGateProps extends BoxProps {
  children: React.ReactNode;
  /** e.g. '3000px 0px 3000px 0px' */
  rootMargin: string;
  /** Paint children on the first render (SSR). Default stays unmounted. */
  initiallyMounted?: boolean;
  /** Height reserved while unmounted, before a real render has been measured.
   *  The SSR feed uses this so a few hundred not-yet-painted cards don't
   *  collapse to 0px and pull the infinite-scroll sentinel into view. */
  unmountedMinHeight?: number;
  /** Aspect ratio reserved while unmounted, so a media slot does not pop
   *  open when its renderer mounts. Ignored once a real height is known. */
  unmountedAspectRatio?: number;
  /** After the first intersection, leave children mounted. */
  keepMounted?: boolean;
}

const OffscreenGate = memo(function OffscreenGate({
  children,
  rootMargin,
  initiallyMounted = false,
  unmountedMinHeight = 0,
  unmountedAspectRatio,
  keepMounted = false,
  style,
  ...boxProps
}: OffscreenGateProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  const seenRef = useRef(false);
  const [mounted, setMounted] = useState(initiallyMounted);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let observer: IntersectionObserver | null = null;
    let root: Element | null | undefined;

    const onEntries = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) {
        seenRef.current = true;
        setMounted(true);
        return;
      }
      // Server-painted cards stay mounted. Unmounting one that the clip
      // still covers collapses the height the HTML reserved.
      if (initiallyMounted) return;
      if (keepMounted && seenRef.current) return;
      const height = entry.boundingClientRect.height;
      if (height > 0) lastHeightRef.current = height;
      setMounted(false);
    };

    const connect = () => {
      const next = findClipScroller(el);
      if (observer && next === root) return;
      root = next;
      observer?.disconnect();
      observer = new IntersectionObserver(onEntries, { root: next, rootMargin });
      observer.observe(el);
    };

    connect();
    const retry = window.setTimeout(connect, 100);
    const retryLate = window.setTimeout(connect, 600);
    window.addEventListener('resize', connect);
    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(retryLate);
      window.removeEventListener('resize', connect);
      observer?.disconnect();
    };
  }, [rootMargin, initiallyMounted, keepMounted]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !mounted || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) lastHeightRef.current = height;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  const reserved = lastHeightRef.current || unmountedMinHeight;
  const useAspect = !mounted && !lastHeightRef.current && !!unmountedAspectRatio;

  // Inline, not a stylesheet class: the placeholder has to be in the same
  // frame as the unmount, including before Chakra's emotion sheet applies.
  const reservedStyle: CSSProperties = {
    ...(style as CSSProperties | undefined),
    minHeight: mounted ? undefined : `${reserved}px`,
    aspectRatio: useAspect ? unmountedAspectRatio : undefined,
  };

  return (
    <Box ref={wrapperRef} {...boxProps} style={reservedStyle}>
      {mounted ? children : null}
    </Box>
  );
});

export default OffscreenGate;
