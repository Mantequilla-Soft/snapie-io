// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTrendingFeed } from './useTrendingFeed';

// Same gap as useDiscoveryCandidates: the Trending tab and the "For You"
// cold/warm feeds all paginate through server pools that only filter muted
// accounts, never muted tags (which are local-only). This hook is where the
// client-side layer belongs for all three.

function item(permlink: string, tags: string[]) {
  return { author: 'someone', permlink, created: new Date().toISOString(), json_metadata: JSON.stringify({ tags }), children: 0 };
}

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [item('good', ['hive']), item('spammy', ['scrobblelife'])],
      hasMore: false,
    }),
  }) as Response);
});

describe('useTrendingFeed mute-tag filtering', () => {
  it('excludes a page item carrying a muted tag', async () => {
    const { result } = renderHook(() => useTrendingFeed({ enabled: true, mutedTags: ['scrobblelife'] }));

    await waitFor(() => expect(result.current.hasFetchedOnce).toBe(true));

    const permlinks = result.current.comments.map(c => c.permlink);
    expect(permlinks).toContain('good');
    expect(permlinks).not.toContain('spammy');
  });

  it('includes everything when no tags are muted', async () => {
    const { result } = renderHook(() => useTrendingFeed({ enabled: true }));

    await waitFor(() => expect(result.current.hasFetchedOnce).toBe(true));
    expect(result.current.comments.map(c => c.permlink)).toEqual(expect.arrayContaining(['good', 'spammy']));
  });

  it('re-filters already-fetched pages instantly when a tag is muted, without a new fetch', async () => {
    const { result, rerender } = renderHook(
      ({ mutedTags }) => useTrendingFeed({ enabled: true, mutedTags }),
      { initialProps: { mutedTags: [] as string[] } },
    );

    await waitFor(() => expect(result.current.hasFetchedOnce).toBe(true));
    const fetchCallsAfterInitialLoad = (global.fetch as any).mock.calls.length;

    rerender({ mutedTags: ['scrobblelife'] });

    expect(result.current.comments.map(c => c.permlink)).not.toContain('spammy');
    expect((global.fetch as any).mock.calls.length).toBe(fetchCallsAfterInitialLoad);
  });
});
