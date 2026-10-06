import type { ExtendedComment } from '@/hooks/useComments';

/** How many leading snaps are painted into the first HTML. Enough for the
 *  first screen. The rest of the seed stays in the payload behind
 *  OffscreenGate — painting every body pulls extra controls into the
 *  accessibility tree and shifts the desktop layout. */
export const SSR_PAINTED_SNAP_COUNT = 3;

/** Snaps serialized into the first HTML. A phone shows about one card and
 *  the top of the next; 15 covers that screen plus a short scroll so the
 *  client can start the next page before the user reaches the end, without
 *  shipping a whole container (often 150+ full comments). */
export const PUBLIC_SNAP_SEED_COUNT = 15;

export interface SnapFeedCursor {
  permlink: string;
  date: string;
}

export interface PublicSnapPage {
  comments: ExtendedComment[];
  hasMore: boolean;
  /**
   * Where useSnaps should resume. Null means the seed is only a prefix of
   * the newest container: the next walk must start at the head and drop
   * permlinks already shown. A cursor is the last container whose replies
   * were included in full, so the next walk starts after it (and dedupes
   * any prefix taken from the following container).
   */
  cursor: SnapFeedCursor | null;
}
