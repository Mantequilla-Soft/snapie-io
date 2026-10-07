import { describe, it, expect } from 'vitest';
import { homePaintedSnapCount, shouldPaintHomeFeedSeed, SSR_PAINTED_SNAP_COUNT } from './publicSnapPage';

describe('home feed seed paint', () => {
  it('paints a blended Latest seed into the first viewport', () => {
    const paint = shouldPaintHomeFeedSeed({
      blendedEnabled: true,
      showBlendedForAll: true,
      activeFilter: 'all',
      discoveryFeed: false,
      seedCount: 15,
    });
    expect(paint).toBe(true);
    expect(homePaintedSnapCount(15, paint)).toBe(SSR_PAINTED_SNAP_COUNT);
  });

  it('does not paint when blended is on but the seed is missing', () => {
    expect(shouldPaintHomeFeedSeed({
      blendedEnabled: true,
      showBlendedForAll: true,
      activeFilter: 'all',
      discoveryFeed: false,
      seedCount: 0,
    })).toBe(false);
    expect(homePaintedSnapCount(0, true)).toBe(0);
  });

  it('does not paint the blended seed after Latest falls back to snaps', () => {
    expect(shouldPaintHomeFeedSeed({
      blendedEnabled: true,
      showBlendedForAll: false,
      activeFilter: 'all',
      discoveryFeed: false,
      seedCount: 15,
    })).toBe(false);
  });

  it('still paints the snaps-only seed when blended is off', () => {
    const paint = shouldPaintHomeFeedSeed({
      blendedEnabled: false,
      showBlendedForAll: false,
      activeFilter: 'all',
      discoveryFeed: false,
      seedCount: 3,
    });
    expect(paint).toBe(true);
    expect(homePaintedSnapCount(3, paint)).toBe(3);
  });

  it('does not paint a discovery tab', () => {
    expect(shouldPaintHomeFeedSeed({
      blendedEnabled: false,
      showBlendedForAll: false,
      activeFilter: 'all',
      discoveryFeed: true,
      seedCount: 15,
    })).toBe(false);
  });
});
