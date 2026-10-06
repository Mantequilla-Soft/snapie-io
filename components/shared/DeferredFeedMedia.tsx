'use client';

import { Box } from '@chakra-ui/react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { afterPriorityImage } from '@/lib/perf/afterPriorityImage';

/**
 * URLs the server probed as GIF or video even though the path has no
 * matching extension. Empty on pages that did not run the probe.
 */
const DeferredMediaUrlContext = createContext<ReadonlySet<string>>(new Set());

function useDeferredUrlSet(urls: readonly string[] | null | undefined) {
  const key = urls?.join('\n') ?? '';
  return useMemo(() => new Set(key ? key.split('\n') : []), [key]);
}

export function DeferredMediaUrlProvider({
  urls,
  children,
}: {
  urls?: readonly string[] | null;
  children: ReactNode;
}) {
  const value = useDeferredUrlSet(urls);
  return (
    <DeferredMediaUrlContext.Provider value={value}>
      {children}
    </DeferredMediaUrlContext.Provider>
  );
}

export function useKnownHeavyMediaUrls(): ReadonlySet<string> {
  return useContext(DeferredMediaUrlContext);
}

/** How close a below-fold GIF or video may come before it may download. */
const NEAR_VIEWPORT_MARGIN = '200px 0px';

/**
 * Holds `children` (the element that would fetch the GIF or video) out of
 * the document until the viewer presses play, or until a below-fold slot
 * scrolls near the viewport after the priority image has loaded.
 *
 * A slot already in the viewport stays on click-to-play. Loading it as soon
 * as it intersects would put those bytes on the same connection as the LCP
 * photo, and a later paint could replace that photo as the LCP element.
 */
export function DeferredMediaGate({
  defer,
  aspectRatio,
  children,
}: {
  defer: boolean;
  aspectRatio: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!defer || playing) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const arm = () => {
      if (cancelled || observer) return true;
      const rect = el.getBoundingClientRect();
      // Chakra's stylesheet can land a frame late. A zero box is not evidence
      // the slot is on screen, so try once more after layout.
      if (rect.height <= 0) return false;
      const belowFold = rect.top >= (window.innerHeight || 0);
      if (!belowFold) return true;
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        afterPriorityImage().then(() => {
          if (!cancelled) setPlaying(true);
        });
      }, { rootMargin: NEAR_VIEWPORT_MARGIN });
      observer.observe(el);
      return true;
    };

    const armed = arm();
    const retry = armed ? 0 : window.requestAnimationFrame(() => { arm(); });
    return () => {
      cancelled = true;
      if (retry) window.cancelAnimationFrame(retry);
      observer?.disconnect();
    };
  }, [defer, playing]);

  if (!defer || playing) return <>{children}</>;

  // Inline aspect-ratio: the reserved box has to exist before Emotion's
  // stylesheet, or the slot collapses and then grows when playback starts.
  const frameStyle = { aspectRatio: String(aspectRatio), width: '100%' };

  return (
    <Box ref={ref} width="100%" style={frameStyle}>
      <Box
        as="button"
        type="button"
        aria-label="Play media"
        data-deferred-media=""
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          setPlaying(true);
        }}
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="blackAlpha.600"
        color="white"
        border="0"
        cursor="pointer"
        style={frameStyle}
      >
        <Box as="span" aria-hidden fontSize="2xl" lineHeight="1">▶</Box>
      </Box>
    </Box>
  );
}
