import { describe, expect, it } from 'vitest';
import {
  FEED_PAGE_PREFETCH_MARGIN_PX,
  elementClipsViewport,
  resolveFeedScrollRoot,
  sentinelNearScrollport,
} from './feedScrollRoot';

function box(clientHeight: number, scrollHeight: number) {
  return { clientHeight, scrollHeight };
}

describe('resolveFeedScrollRoot', () => {
  const view = 800;

  it('uses the explicit target when that box clips the viewport', () => {
    const explicit = box(800, 5000);
    const fromList = box(800, 5000);
    expect(elementClipsViewport(explicit, view)).toBe(true);
    expect(resolveFeedScrollRoot(explicit, fromList, view)).toBe(explicit);
  });

  it('ignores an explicit target that grew with its content', () => {
    const explicit = box(4000, 4000);
    const fromList = box(800, 4000);
    expect(elementClipsViewport(explicit, view)).toBe(false);
    expect(resolveFeedScrollRoot(explicit, fromList, view)).toBe(fromList);
  });

  it('keeps a short explicit target when the list has not found a clip scroller', () => {
    const explicit = box(400, 400);
    expect(resolveFeedScrollRoot(explicit, null, view)).toBe(explicit);
    expect(resolveFeedScrollRoot(null, null, view)).toBeNull();
  });
});

describe('sentinelNearScrollport', () => {
  it('prefetches inside a 2000px band and stops on the boundary', () => {
    expect(FEED_PAGE_PREFETCH_MARGIN_PX).toBe(2000);
    // 800 + 1999 is still inside the band. 800 + 2000 is the edge and stays out.
    expect(sentinelNearScrollport(2799, 800)).toBe(true);
    expect(sentinelNearScrollport(2800, 800)).toBe(false);
    expect(sentinelNearScrollport(10000, 800)).toBe(false);
  });
});
