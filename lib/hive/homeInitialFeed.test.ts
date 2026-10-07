import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadHomeInitialSnapPage } from './homeInitialFeed';
import { getInitialPublicBlendedPage } from '@/lib/hive/publicBlendedFeed';
import { getInitialPublicSnapPage } from '@/lib/hive/publicSnapFeed';
import type { PublicSnapPage } from '@/lib/hive/publicSnapPage';

vi.mock('@/lib/hive/publicBlendedFeed', () => ({
  getInitialPublicBlendedPage: vi.fn(),
}));

vi.mock('@/lib/hive/publicSnapFeed', () => ({
  getInitialPublicSnapPage: vi.fn(),
}));

function page(permlink: string, body: string): PublicSnapPage {
  return {
    comments: [{
      author: 'alice',
      permlink,
      body,
      created: '2026-08-29T00:00:00',
    } as PublicSnapPage['comments'][number]],
    hasMore: true,
    cursor: null,
    before: '2026-08-29T00:00:00',
  };
}

beforeEach(() => {
  vi.mocked(getInitialPublicBlendedPage).mockReset();
  vi.mocked(getInitialPublicSnapPage).mockReset();
  vi.mocked(getInitialPublicBlendedPage).mockResolvedValue(page('wave-1', 'hello **wave**'));
  vi.mocked(getInitialPublicSnapPage).mockResolvedValue(page('snap-1', 'hello **snap**'));
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED;
});

describe('loadHomeInitialSnapPage', () => {
  it('seeds the sidecar page when blended Latest is on', async () => {
    process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED = 'true';

    const seeded = await loadHomeInitialSnapPage();

    expect(getInitialPublicBlendedPage).toHaveBeenCalledOnce();
    expect(getInitialPublicSnapPage).not.toHaveBeenCalled();
    expect(seeded?.comments.map(comment => comment.permlink)).toEqual(['wave-1']);
    expect(seeded?.comments[0].bodyHtml).toContain('wave');
    expect(seeded?.comments[0].bodyHtml).not.toContain('**');
    expect(seeded?.before).toBe('2026-08-29T00:00:00');
  });

  it('keeps the snaps seed when blended Latest is off', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED;

    const seeded = await loadHomeInitialSnapPage();

    expect(getInitialPublicSnapPage).toHaveBeenCalledOnce();
    expect(getInitialPublicBlendedPage).not.toHaveBeenCalled();
    expect(seeded?.comments.map(comment => comment.permlink)).toEqual(['snap-1']);
    expect(seeded?.comments[0].bodyHtml).toContain('snap');
  });

  it('stays null when the blended source has nothing to paint', async () => {
    process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED = 'true';
    vi.mocked(getInitialPublicBlendedPage).mockResolvedValue(null);

    await expect(loadHomeInitialSnapPage()).resolves.toBeNull();
    expect(getInitialPublicSnapPage).not.toHaveBeenCalled();
  });
});
