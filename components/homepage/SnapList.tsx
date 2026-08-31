import React, { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { Virtuoso, ListRange } from 'react-virtuoso';
import { Box, Button, HStack, Spinner, Text } from '@chakra-ui/react';
import Snap from './Snap';
import { ExtendedComment, useComments } from '@/hooks/useComments';
import { useSnaps } from '@/hooks/useSnaps';
import SnapComposer from './SnapComposer';
import { getPayoutValue } from '@/lib/hive/client-functions';
import { interleaveCandidates } from '@/lib/discovery/interleave';

type SortOrder = 'new' | 'top';

// Virtuoso treats components.List as a component *type*, not a plain render
// prop — an inline function recreated every render (as this used to be,
// defined right inside the JSX) is a *new* component type each time, so
// React unmounts and remounts the whole list on every SnapList re-render.
// Define it once, at module scope, so its identity never changes. It
// doesn't depend on any of SnapList's state, so this is the whole fix for
// it — no props to thread through.
const VirtuosoList = forwardRef<HTMLDivElement, { style?: React.CSSProperties; children?: React.ReactNode }>(
  ({ style, children }, ref) => (
    <Box ref={ref} style={style} mx="auto" px={{ base: 0, md: 2 }}>{children}</Box>
  )
);
VirtuosoList.displayName = 'VirtuosoList';

const virtuosoComponents = { List: VirtuosoList };

const SORT_OPTIONS = ['new', 'top'] as const;

// Neither the composer nor the New/Top toggle live inside <Virtuoso> (as a
// Header, or anywhere else Virtuoso manages), even though both visually sit
// above the list. Two different failure modes ruled that out:
//  - The composer (image/video/gif upload state, postMessage listeners)
//    inside a Header slot produced a genuine "Maximum update depth
//    exceeded" crash — some interaction between its own effects and
//    Virtuoso's Header re-rendering.
//  - Virtuoso's `context` prop, tried as a way to feed live state into a
//    stable Header component without recreating it, turned out to only
//    reach Header/Footer on Virtuoso's own internal render triggers
//    (scroll, resize) — not immediately when the context value itself
//    changes. Confirmed directly: clicking the sort toggle updated
//    `sortOrder` correctly, but the button's highlight only caught up
//    after the next scroll.
// Both are rendered as plain siblings around <Virtuoso> instead — normal
// React children, driven by SnapList's own render cycle, so they're always
// instantly correct. This matches how PostPage already renders its own
// composer outside SnapList entirely.

interface SnapListProps {
  author: string
  permlink: string
  setConversation: (conversation: ExtendedComment) => void;
  onOpen: () => void;
  setReply: (reply: ExtendedComment) => void;
  post?: boolean;
  data: InfiniteScrollData
  /** Shown when a completed fetch comes back with zero comments. Lets callers
   *  give a filter-specific message (e.g. the Patrons tab) instead of the
   *  generic default. */
  emptyMessage?: React.ReactNode
  /** Discovery Engine Phase 1 — optional, undefined/empty changes nothing for
   *  any existing caller. Spliced in after sorting, only when sortOrder is
   *  'new' — see the interleave call below for why. */
  discoveryItems?: ExtendedComment[]
  discoveryEveryN?: number
  /** id of the ancestor element that actually scrolls, so Virtuoso can hook
   *  into it (customScrollParent) instead of owning its own internal
   *  scroller. Defaults to 'scrollableDiv', the local scroll box every
   *  caller except PostPage defines for itself — see PostPage's own call
   *  site for why it needs to pass something else. */
  scrollableTargetId?: string
}

interface InfiniteScrollData {
  comments: ExtendedComment[];
  loadNextPage: () => void; // Default can be an empty function in usage
  isLoading: boolean;
  hasMore: boolean; // Default can be `false` in usage
  /** True once at least one fetch attempt has completed (success or error).
   *  Distinct from `hasMore` — a capped fetch can legitimately come back
   *  empty while `hasMore` is still true (more unscanned history exists),
   *  so the empty state can't rely on `!hasMore` alone anymore. */
  hasFetchedOnce?: boolean;
  refresh?: () => void; // Function to refresh the feed
  /** Reconciles one comment's optimistic vote data against the real settled
   *  chain value — see the matching helper in useSnaps.ts/useProfileSnaps.ts
   *  for why this exists (a comment is otherwise never revisited once
   *  fetched). Optional since useComments.ts doesn't have one yet. */
  refreshComment?: (author: string, permlink: string) => void;
}

export default function SnapList(
  {
    author,
    permlink,
    setConversation,
    onOpen,
    setReply,
    post,
    data,
    emptyMessage = 'No snaps yet.',
    discoveryItems,
    discoveryEveryN = 5,
    scrollableTargetId = 'scrollableDiv',
}: SnapListProps) {
  const { comments, loadNextPage, isLoading, hasMore, hasFetchedOnce, refresh, refreshComment } = data
  // Older data sources (useComments, useProfileSnaps) don't track this yet —
  // fall back to the previous "!hasMore means done" inference for them.
  const fetchComplete = hasFetchedOnce ?? !hasMore;
  const [sortOrder, setSortOrder] = useState<SortOrder>('new');

  // Virtuoso's customScrollParent needs an actual element, not the id string
  // react-infinite-scroll-component used to take — resolve it the same way
  // that library did internally (a plain getElementById lookup against the
  // page's own scroll container, which is already mounted by the time this
  // component renders).
  const [scrollParentEl, setScrollParentEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setScrollParentEl(document.getElementById(scrollableTargetId));
  }, [scrollableTargetId]);

  // `refresh`'s own identity changes every render (it's a plain closure
  // from useSnaps, not memoized) — read the latest value through a ref
  // rather than closing over it directly.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const handleNewComment = useCallback(() => {
    // Simple feed refresh after posting with delay for blockchain to catch up
    if (refreshRef.current) {
      setTimeout(() => {
        refreshRef.current?.();
      }, 3000); // 3 second delay to let Hive blockchain propagate the transaction
    }
  }, []);

  comments.sort((a: ExtendedComment, b: ExtendedComment) => {
    if (sortOrder === 'top') {
      return parseFloat(getPayoutValue(b)) - parseFloat(getPayoutValue(a));
    }
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  // Discovery candidates only make sense against the chronological view —
  // 'top' is an explicit request for payout ranking, and injecting
  // engagement-ranked items there would contradict what the user just asked
  // for. Must happen after the sort above, not before — comments.sort()
  // mutates in place and re-runs on every render, so anything spliced in
  // upstream of it would just get reshuffled back out.
  const displayComments = (discoveryItems?.length && sortOrder === 'new')
    ? interleaveCandidates(comments, discoveryItems, discoveryEveryN)
    : comments;

  // Post-vote reconciliation (Snap.tsx's handleVote) only ever refreshes a
  // comment YOU voted on — the far more common case is just scrolling past
  // one that already has stale data because someone ELSE voted on it since
  // it was first fetched (confirmed live: a real Snap with votes sitting at
  // $0.000, never interacted with, just scrolled past). Reconcile each Snap
  // once as it actually enters the viewport. `rangeChanged` reports the
  // strictly-visible range, not the wider overscan buffer Virtuoso
  // keeps mounted — deliberately not refreshing everything overscanned,
  // only what's actually been seen. `refreshedRef` is a plain session-
  // lifetime set (no existing per-item timestamp/cooldown tracking to build
  // on, and one refresh per visit is enough — a real time-based cooldown
  // would be solving a problem nobody asked for).
  //
  // Regression fixed here: firing refreshComment directly from every
  // rangeChanged tick (as this originally did) calls setComments once per
  // newly-visible item, each on its own network-resolution timer — on
  // mobile, a burst of these landing *while the user's finger is still on
  // the screen* was producing a new `data` array reference for Virtuoso
  // mid-gesture, repeatedly, which fought the browser's own scroll physics
  // badly enough that scrolling past the first screenful became effectively
  // impossible. Fix: only ever resolve pending refreshes once the gesture
  // has settled — via Virtuoso's own `isScrolling` callback, or via a short
  // idle window (below) — rangeChanged during an active scroll just records
  // the latest range without touching state.
  const refreshedRef = useRef<Set<string>>(new Set());
  const pendingRangeRef = useRef<ListRange | null>(null);
  const isScrollingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingRange = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    const range = pendingRangeRef.current;
    pendingRangeRef.current = null;
    if (!range || !refreshComment) return;
    for (let i = range.startIndex; i <= range.endIndex; i++) {
      const c = displayComments[i];
      if (!c) continue;
      const key = `${c.author}/${c.permlink}`;
      if (refreshedRef.current.has(key)) continue;
      refreshedRef.current.add(key);
      refreshComment(c.author, c.permlink);
    }
  }, [displayComments, refreshComment]);

  const handleRangeChanged = useCallback((range: ListRange) => {
    if (!refreshComment) return;
    pendingRangeRef.current = range;
    if (!isScrollingRef.current) {
      // Not mid-gesture (e.g. the mount bootstrap below, or a programmatic
      // scroll) — nothing will flip isScrolling false to flush it otherwise.
      flushPendingRange();
      return;
    }
    // Still scrolling per Virtuoso, but relying solely on a full stop means
    // a long continuous scroll session (flick after flick with barely a
    // pause) can leave everything you've already passed stale until you
    // finally stop moving entirely. A brief lull — no new items entering
    // view for a bit — is a safe moment too: it means the visible range
    // itself has stopped changing, not just that we haven't checked in a
    // while, so this can't fire mid-motion the way the original bug did.
    // Every new tick reschedules it, so a genuinely continuous scroll never
    // lets this timer survive long enough to fire.
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(flushPendingRange, 350);
  }, [refreshComment, flushPendingRange]);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    isScrollingRef.current = scrolling;
    if (!scrolling) flushPendingRange();
  }, [flushPendingRange]);

  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  // Confirmed empirically: Virtuoso's rangeChanged never fires until an
  // actual scroll happens — the first screenful (exactly the "just opened
  // the feed, haven't scrolled yet" case the whole feature is for) would
  // otherwise never get reconciled. Bootstrap it once, directly, the same
  // way a real scroll-triggered call would.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current || displayComments.length === 0) return;
    bootstrappedRef.current = true;
    handleRangeChanged({ startIndex: 0, endIndex: Math.min(7, displayComments.length - 1) });
  }, [displayComments, handleRangeChanged]);

  if (isLoading && comments.length === 0) {
    return (
      <Box textAlign="center" mt={4}>
        <Spinner size="xl" />
        <Text>Loading posts...</Text>
      </Box>
    );
  }

  if (!isLoading && fetchComplete && comments.length === 0) {
    return (
      <Box textAlign="center" mt={8} color="gray.500">
        <Text fontSize="lg">{emptyMessage}</Text>
      </Box>
    );
  }

  const showSortToggle = post && comments.length > 1;

  return (
    <>
      {/* Deliberately outside <Virtuoso> — see the comment above for why. */}
      {!post && <Box id="snap-composer"><SnapComposer pa={author} pp={permlink} onNewComment={handleNewComment} onClose={() => null} /></Box>}
      {showSortToggle && (
        <HStack spacing={2} px={2} pt={3} pb={1}>
          {SORT_OPTIONS.map(opt => (
            <Button
              key={opt}
              size="sm"
              variant="ghost"
              borderRadius="full"
              bg={sortOrder === opt ? 'muted' : 'transparent'}
              color={sortOrder === opt ? 'text' : 'gray.500'}
              borderWidth="1px"
              borderColor={sortOrder === opt ? 'primary' : 'border'}
              _hover={{ bg: 'muted', color: 'text' }}
              onClick={() => setSortOrder(opt)}
            >
              {opt === 'new' ? '✨ New' : '💰 Top'}
            </Button>
          ))}
        </HStack>
      )}
      <Virtuoso
        useWindowScroll={false}
        customScrollParent={scrollParentEl ?? undefined}
        data={displayComments}
        computeItemKey={(_index, comment) => comment.permlink}
        endReached={loadNextPage}
        rangeChanged={handleRangeChanged}
        isScrolling={handleIsScrolling}
        // 800px flat (both directions) was too tight for Snap cards that can
        // run several hundred px tall with media/embeds — normal scroll
        // velocity crossed it in well under a second, so cards kept
        // unmounting/remounting right at the edge of view. Remounting isn't
        // just a visual pop-in: Snap.tsx holds local state (NSFW reveal,
        // translation, edit mode, optimistic payout) that resets every time,
        // which is what actually read as "always loading/freeing something."
        // Biased toward the scroll direction (`main`) since that's where the
        // buffer earns its keep; `reverse` stays smaller since scrolling
        // back up is comparatively rare. Still bounded — nowhere near "keep
        // everything mounted forever," just enough headroom to absorb a
        // normal scroll without thrashing at the boundary.
        overscan={{ main: 2000, reverse: 1000 }}
        components={virtuosoComponents}
        itemContent={(_index, comment: ExtendedComment) => (
          <Snap
            comment={comment}
            onOpen={onOpen}
            setReply={setReply}
            refreshComment={refreshComment}
            {...(!post ? { setConversation } : {})}
          />
        )}
      />
      {/* Same reasoning as the composer/toggle above — a Virtuoso Footer
          driven by `hasMore` via context would lag a scroll event behind. */}
      {hasMore && (
        <Box display="flex" justifyContent="center" alignItems="center" py={5}>
          <Spinner size="xl" color="primary" />
        </Box>
      )}
    </>
  );
}
