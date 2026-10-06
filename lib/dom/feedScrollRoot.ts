/**
 * How far below the feed scrollport still counts as "near" for the next page.
 * The scroll listener and the sentinel IntersectionObserver share this so a
 * continuous scroll cannot stall once the sentinel stays inside the margin.
 */
export const FEED_PAGE_PREFETCH_MARGIN_PX = 2000;

type ClipBox = {
  scrollHeight: number;
  clientHeight: number;
};

/**
 * True when `el` is a viewport-sized box that actually clips its children.
 * An overflow ancestor that grew to the height of its content is not a root:
 * everything inside it looks visible, and the next page fetches immediately.
 */
export function elementClipsViewport(el: ClipBox | null, viewportHeight: number): boolean {
  if (!el) return false;
  return el.scrollHeight > el.clientHeight + 1 && el.clientHeight <= viewportHeight + 2;
}

/**
 * Prefer the explicit scroll target when it clips. Otherwise use the clip
 * scroller found from the list, then the explicit element even if it does
 * not clip yet (a short first page).
 */
export function resolveFeedScrollRoot<T extends ClipBox>(
  explicit: T | null,
  fromList: T | null,
  viewportHeight: number,
): T | null {
  if (elementClipsViewport(explicit, viewportHeight)) return explicit;
  return fromList ?? explicit;
}

/**
 * True when the sentinel is inside the prefetch band under the scrollport.
 * Equality with the margin is outside the band, matching `top - bottom < margin`.
 */
export function sentinelNearScrollport(
  sentinelTop: number,
  rootBottom: number,
  marginPx = FEED_PAGE_PREFETCH_MARGIN_PX,
): boolean {
  return sentinelTop - rootBottom < marginPx;
}
