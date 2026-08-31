'use client';
import { Box, BoxProps } from '@chakra-ui/react';
import { memo, useEffect, useRef, useState } from 'react';

/**
 * Generic "unmount when far away, remount when approached" gate. Two uses
 * in the feed, at two different scopes — see SnapList.tsx and Snap.tsx:
 *
 *  - A tight margin around just a card's MEDIA (iframes/videos/images),
 *    the actually-expensive part, so nearby cards keep their embeds warm.
 *  - A wide margin around the WHOLE card, to bound total mounted cards
 *    for a long session. Card virtualization (react-virtuoso) used to do
 *    this but converted every late-settling embed into a scroll-position
 *    shove, because cards were destroyed/recreated constantly and
 *    Virtuoso's compensation both disabled the browser's native scroll
 *    anchoring and overcorrected (measured live: a 301px embed settle
 *    produced a 1579px scroll throw). Keeping every card mounted forever
 *    fixed that, but reintroduced the ORIGINAL problem this component's
 *    sibling usage was built for: unbounded memory growth over a long
 *    doomscroll — fine on desktop, but mobile browsers hard-kill and
 *    silently reload a tab that crosses their memory ceiling, which reads
 *    as "the feed just stops going further" with no visible error.
 *
 * Safe from the jump bug at either scope because the placeholder freezes
 * the exact last-rendered height, and the session-lifetime caches in
 * MediaRenderer/TwitterEmbed/VideoRenderer/ImageWithFallback make a
 * remounted card's media render at its final size immediately — no settle,
 * so no shove — as long as the margin is wide enough that ordinary
 * scroll-back never crosses it, which is the caller's job to size.
 */
interface OffscreenGateProps extends BoxProps {
  children: React.ReactNode;
  /** e.g. '3000px 0px 3000px 0px' */
  rootMargin: string;
}

// Extra Box props (data-*, sx, id, ...) land on THIS component's own
// wrapper rather than a nested child — deliberately. A caller layering its
// own contentVisibility/data-attribute div around this one would put the
// IntersectionObserver's target one level inside a content-visibility:auto
// ancestor; when that ancestor is skipped, the browser skips layout for its
// descendants too, so the nested target's geometry can go stale exactly
// when the observer needs it to decide whether to mount. Being the single
// element both concerns act on avoids that entirely.
const OffscreenGate = memo(function OffscreenGate({
  children,
  rootMargin,
  ...boxProps
}: OffscreenGateProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);
  // Starts UNmounted: a fetched page appends ~30 cards in one commit, and
  // mounting everything eagerly meant a burst of work booting in one frame
  // far below the viewport — felt as the scroll periodically freezing. The
  // observer fires within a frame of mount, so anything actually near the
  // viewport mounts essentially immediately; everything else waits until
  // approached. The placeholder starts at 0px, which is fine below the
  // viewport (that's where new content appears) and settles harmlessly.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
        } else {
          // Capture the real rendered height while still mounted, then
          // swap to a placeholder of exactly that height.
          lastHeightRef.current = el.getBoundingClientRect().height;
          setMounted(false);
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <Box ref={wrapperRef} {...boxProps} minH={mounted ? undefined : `${lastHeightRef.current}px`}>
      {mounted ? children : null}
    </Box>
  );
});

export default OffscreenGate;
