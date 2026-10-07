import type { ExtendedComment } from '@/hooks/useComments';

/** How many leading snaps are painted into the first HTML.
 *  Mobile is 823px tall and desktop is 940px. After the composer and tabs,
 *  about four short cards fit; five covers a text run before the first photo
 *  on both. The rest of the seed stays behind OffscreenGate. */
export const SSR_PAINTED_SNAP_COUNT = 5;

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
   * Blended Latest leaves this null and sets `before` instead.
   */
  cursor: SnapFeedCursor | null;
  /**
   * Where useBlendedFeed should resume: the `created` time of the oldest
   * item in this page, passed as the sidecar `before` cursor. Set only on
   * the blended home seed. Absent on the snaps-only seed.
   */
  before?: string | null;
}

/** Whether the home feed should paint its server seed into the first HTML.
 *  Blended Latest paints when that source is the one on screen. The
 *  snaps-only seed paints when blended is off. A blended outage falls
 *  through to the client snaps fetch and does not paint the other source. */
export function shouldPaintHomeFeedSeed(input: {
  blendedEnabled: boolean;
  showBlendedForAll: boolean;
  activeFilter: string;
  discoveryFeed: boolean;
  seedCount: number;
}): boolean {
  if (input.seedCount <= 0) return false;
  if (input.activeFilter !== 'all' || input.discoveryFeed) return false;
  if (input.blendedEnabled) return input.showBlendedForAll;
  return true;
}

export function homePaintedSnapCount(seedCount: number, paintSeed: boolean): number {
  if (!paintSeed || seedCount <= 0) return 0;
  return Math.min(SSR_PAINTED_SNAP_COUNT, seedCount);
}
