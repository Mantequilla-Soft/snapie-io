/**
 * The element that actually clips and scrolls `start`.
 *
 * Feed cards live in a nested overflow box. An IntersectionObserver rooted
 * at the viewport does not extend `rootMargin` through that clip, so a gate
 * only flips when the card is already on screen and the mount itself shifts
 * layout. The root has to be the box whose client height is the visible
 * window — not an overflow ancestor that grew to the height of its content
 * (everything inside that box looks "visible").
 */
export function findClipScroller(start: Element | null): HTMLElement | null {
  if (!start || typeof window === 'undefined') return null;
  const viewH = window.innerHeight || 800;
  let node = start.parentElement;
  let viewportSized: HTMLElement | null = null;

  while (node && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
      const clips = node.scrollHeight > node.clientHeight + 1;
      const bounded = node.clientHeight > 0 && node.clientHeight <= viewH + 2;
      if (clips && bounded) return node;
      if (!clips && bounded && !viewportSized) viewportSized = node;
    }
    node = node.parentElement;
  }

  return viewportSized;
}
