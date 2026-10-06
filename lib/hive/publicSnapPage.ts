import type { ExtendedComment } from '@/hooks/useComments';

/** How many leading snaps are painted into the first HTML. Enough for the
 *  first screen. The rest of the page stays in the payload (so hydration
 *  does not refetch it) behind OffscreenGate — a container batch is hundreds
 *  of snaps, and painting every body pulls extra controls into the
 *  accessibility tree and shifts the desktop layout. */
export const SSR_PAINTED_SNAP_COUNT = 3;

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
