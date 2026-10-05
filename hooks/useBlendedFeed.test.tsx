// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBlendedFeed } from './useBlendedFeed';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

// Same isolation/mocking approach as useSnaps.test.tsx — useBlendedFeed
// seeds its initial data from `/api/feed` (the sidecar proxy) rather than
// HiveClient directly, but refreshComment still goes through getPost like
// every other data source.

const settingsState = vi.hoisted(() => ({ mutedTags: [] as string[] }));
const personalMuteListeners = vi.hoisted(() => new Set<(author: string) => void>());

vi.mock('./useUserSettings', () => ({
  useUserSettings: () => ({ settings: { mutedTags: settingsState.mutedTags } }),
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: {
    getMutedList: vi.fn(async () => new Set<string>()),
    subscribePersonalMute: (listener: (author: string) => void) => {
      personalMuteListeners.add(listener);
      return () => personalMuteListeners.delete(listener);
    },
  },
}));

const getPostMock = vi.fn();
vi.mock('@/lib/hive/client-functions', () => ({
  getPost: (...args: unknown[]) => getPostMock(...args),
}));

function feedItem(permlink: string, overrides: Record<string, unknown> = {}) {
  return {
    source: 'snap',
    author: 'someone',
    permlink,
    created: '2026-08-29T00:00:00',
    parentAuthor: 'peak.snaps',
    parentPermlink: 'snap-container-1',
    active_votes: [],
    pending_payout_value: '0.000 HBD',
    total_payout_value: '0.000 HBD',
    curator_payout_value: '0.000 HBD',
    net_rshares: 0,
    ...overrides,
  };
}

beforeEach(() => {
  getPostMock.mockReset();
  settingsState.mutedTags = [];
  personalMuteListeners.clear();
  vi.mocked(mutedAccountsManager.getMutedList).mockClear();
  vi.mocked(mutedAccountsManager.getMutedList).mockResolvedValue(new Set<string>());
});

describe('useBlendedFeed.refreshComment', () => {
  it("patches only the matching item's vote/payout fields, leaving others and array order untouched", async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        items: [
          feedItem('target', { active_votes: [{ voter: 'alice' }] }),
          feedItem('bystander', { active_votes: [{ voter: 'bob' }] }),
        ],
        hasMore: false,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBlendedFeed());
    await waitFor(() => expect(result.current.comments).toHaveLength(2));

    getPostMock.mockResolvedValueOnce({
      active_votes: [{ voter: 'alice' }, { voter: 'carol' }],
      pending_payout_value: '0.164 HBD',
      total_payout_value: '0.000 HBD',
      curator_payout_value: '0.000 HBD',
      net_rshares: 2548588774622,
    });

    await act(async () => {
      await result.current.refreshComment('someone', 'target');
    });

    const [first, second] = result.current.comments as any[];
    expect(first.permlink).toBe('target');
    expect(second.permlink).toBe('bystander');

    expect(first.pending_payout_value).toBe('0.164 HBD');
    expect(first.active_votes).toHaveLength(2);

    expect(second.pending_payout_value).toBe('0.000 HBD');
    expect(second.active_votes).toHaveLength(1);

    expect(getPostMock).toHaveBeenCalledWith('someone', 'target');
    vi.unstubAllGlobals();
  });

  it('leaves the existing data in place if the refetch fails', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ items: [feedItem('target')], hasMore: false }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBlendedFeed());
    await waitFor(() => expect(result.current.comments).toHaveLength(1));

    getPostMock.mockRejectedValueOnce(new Error('sidecar unreachable'));

    await act(async () => {
      await result.current.refreshComment('someone', 'target');
    });

    expect((result.current.comments[0] as any).pending_payout_value).toBe('0.000 HBD');
    vi.unstubAllGlobals();
  });
});

describe('useBlendedFeed mute filters', () => {
  it('refetches once muted tags hydrate, and drops posts carrying that tag', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        items: [
          feedItem('keep', { json_metadata: JSON.stringify({ tags: ['photography'] }) }),
          feedItem('drop', { json_metadata: JSON.stringify({ tags: ['scrobblelife'] }) }),
        ],
        hasMore: false,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(() => useBlendedFeed({ username: 'viewer' }));
    await waitFor(() => expect(result.current.comments.map(c => c.permlink).sort()).toEqual(['drop', 'keep']));

    const callsBefore = fetchMock.mock.calls.length;
    settingsState.mutedTags = ['scrobblelife'];
    rerender();

    await waitFor(() => {
      const permlinks = result.current.comments.map(c => c.permlink);
      expect(permlinks).toContain('keep');
      expect(permlinks).not.toContain('drop');
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    vi.unstubAllGlobals();
  });

  it('loads the signed-in mute list when username arrives after mount', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ items: [feedItem('a')], hasMore: false }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = renderHook(
      ({ username }: { username?: string }) => useBlendedFeed({ username }),
      { initialProps: { username: undefined as string | undefined } },
    );

    await waitFor(() => expect(mutedAccountsManager.getMutedList).toHaveBeenCalledWith(undefined));

    rerender({ username: 'viewer' });

    await waitFor(() => expect(mutedAccountsManager.getMutedList).toHaveBeenCalledWith('viewer'));
    vi.unstubAllGlobals();
  });

  it('drops a muted author from the loaded page immediately', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        items: [
          feedItem('keep', { author: 'goodauthor' }),
          feedItem('gone', { author: 'spammer' }),
          feedItem('also-gone', { author: 'Spammer' }),
        ],
        hasMore: false,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useBlendedFeed({ username: 'viewer' }));
    await waitFor(() => expect(result.current.comments).toHaveLength(3));

    act(() => {
      personalMuteListeners.forEach(listener => listener('spammer'));
    });

    expect(result.current.comments.map(c => c.permlink)).toEqual(['keep']);
    vi.unstubAllGlobals();
  });

  it('does not let a superseded fetch restore the pagination cursor', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const before = new URL(String(url), 'http://localhost').searchParams.get('before');
      if (before === '2026-08-01T00:00:00') {
        return {
          json: async () => ({
            items: [feedItem('stale-page', { created: '2026-07-01T00:00:00' })],
            hasMore: true,
          }),
        };
      }
      return {
        json: async () => ({
          items: [feedItem('fresh-page', { created: '2026-08-01T00:00:00' })],
          hasMore: true,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ username }: { username?: string }) => useBlendedFeed({ username }),
      { initialProps: { username: 'viewer' as string | undefined } },
    );
    await waitFor(() => expect(result.current.comments.map(c => c.permlink)).toEqual(['fresh-page']));

    let releaseStale!: (list: Set<string>) => void;
    const staleMuteList = new Promise<Set<string>>(resolve => { releaseStale = resolve; });
    let muteListCalls = 0;
    vi.mocked(mutedAccountsManager.getMutedList).mockImplementation(() => {
      muteListCalls += 1;
      if (muteListCalls === 1) return staleMuteList;
      return Promise.resolve(new Set<string>());
    });

    act(() => {
      result.current.loadNextPage();
    });
    await waitFor(() => expect(muteListCalls).toBe(1));

    rerender({ username: 'other' });
    await waitFor(() => expect(result.current.comments.map(c => c.permlink)).toEqual(['fresh-page']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      releaseStale(new Set());
    });
    // loadNextPage ignores calls for 1s after the page that was superseded.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    const callsBeforeNext = fetchMock.mock.calls.length;
    act(() => {
      result.current.loadNextPage();
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeNext));

    const nextUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
    expect(nextUrl).toContain('before=2026-08-01T00%3A00%3A00');
    expect(nextUrl).not.toContain('2026-07-01');
    vi.unstubAllGlobals();
  });
});
