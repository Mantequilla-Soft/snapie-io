import type { ExtendedComment } from '@/hooks/useComments';

/** How many leading snaps are painted into the first HTML. The rest of the
 *  page is still in the payload (so hydration does not refetch it) but stays
 *  behind OffscreenGate until scrolled near — a container batch is hundreds
 *  of snaps, and painting every body would dwarf the LCP win. */
export const SSR_PAINTED_SNAP_COUNT = 12;

export interface SnapFeedCursor {
  permlink: string;
  date: string;
}

export interface PublicSnapPage {
  comments: ExtendedComment[];
  hasMore: boolean;
  /** Cursor useSnaps stores after this walk, so infinite scroll continues. */
  cursor: SnapFeedCursor;
}
