/**
 * Scroll policy for the chat message list.
 *
 * Switching conversations must land on the newest message. Reading older
 * history in the current conversation must keep the viewport where the user
 * left it. Virtuoso mounts at the top and only honors `initialTopMostItemIndex`
 * on mount; `scrollToIndex` from an effect does not run on that first mount.
 * `startReached` also fires while the viewport is still on the oldest loaded
 * row. Paging history in at that moment prepends rows and leaves a long thread
 * mid-list, and the matching `atBottom(false)` used to cancel the pin.
 */

export const CHAT_LIST_INDEX_ORIGIN = 1_000_000;

export interface ChatScrollPin {
  /** Keep the viewport on the newest message. */
  stickToLatest: boolean;
  /** This conversation has rested on the newest message at least once. */
  settledAtLatest: boolean;
}

export function pinForNewConversation(): ChatScrollPin {
  return { stickToLatest: true, settledAtLatest: false };
}

/**
 * A not-at-bottom report before the list has settled is the mount frame at
 * the top, not the user scrolling up to read history.
 */
export function pinAfterAtBottom(pin: ChatScrollPin, atBottom: boolean): ChatScrollPin {
  if (atBottom) return { stickToLatest: true, settledAtLatest: true };
  if (!pin.settledAtLatest) return pin;
  return { stickToLatest: false, settledAtLatest: true };
}

/** Older pages load only after the user has scrolled up from a settled bottom. */
export function shouldPageOlderHistory(pin: ChatScrollPin): boolean {
  return pin.settledAtLatest && !pin.stickToLatest;
}

/**
 * A page that fits in the viewport is both at the top and the bottom, so the
 * user cannot scroll up to reach `startReached`. One backfill reveals history
 * without walking the whole thread on open.
 */
export function shouldBackfillShortThread(
  pin: ChatScrollPin,
  atTop: boolean,
  alreadyBackfilled: boolean,
): boolean {
  return pin.settledAtLatest && pin.stickToLatest && atTop && !alreadyBackfilled;
}

/** Virtuoso's index space is offset by `firstItemIndex`. */
export function absoluteMessageIndex(firstItemIndex: number, arrayIndex: number): number {
  return firstItemIndex + arrayIndex;
}

/**
 * Keep the absolute index of rows that survive a prepend or a tail trim.
 * A full replacement (no shared ids) returns the origin so a remounted list
 * starts clean. The result stays positive, which Virtuoso requires.
 */
export function nextFirstItemIndex(
  prevFirst: number,
  prev: readonly { _id: string }[],
  next: readonly { _id: string }[],
): number {
  if (!prev.length || !next.length) return CHAT_LIST_INDEX_ORIGIN;
  const nextPos = new Map(next.map((message, index) => [message._id, index]));
  for (let i = 0; i < prev.length; i++) {
    const idx = nextPos.get(prev[i]._id);
    if (idx === undefined) continue;
    const shifted = prevFirst + i - idx;
    return shifted > 0 ? shifted : CHAT_LIST_INDEX_ORIGIN;
  }
  return CHAT_LIST_INDEX_ORIGIN;
}
