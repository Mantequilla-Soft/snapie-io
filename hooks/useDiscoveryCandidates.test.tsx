// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDiscoveryCandidates } from './useDiscoveryCandidates';
import { compileFilter, type ContentFilter } from '@snapie/content-filter';

const NONE: ContentFilter = () => false;
const MUTE_SCROBBLE = compileFilter([{ kind: 'tag', tag: 'scrobblelife' }]);

// Shared discovery pools only bake community mutes into the cache. Personal
// account mutes and muted tags are applied client-side here.

function item(permlink: string, tags: string[], author = 'someone') {
  return { author, permlink, created: new Date().toISOString(), json_metadata: JSON.stringify({ tags }), children: 0, isDiscovery: true };
}

const personalMuteListeners = vi.hoisted(() => new Set<(author: string) => void>());
const getMutedListMock = vi.hoisted(() =>
  vi.fn(async (username?: string) => {
    if (username === 'viewer') return new Set(['spammer']);
    return new Set<string>();
  }),
);

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: {
    getMutedList: (username?: string) => getMutedListMock(username),
    subscribePersonalMute: (listener: (author: string) => void) => {
      personalMuteListeners.add(listener);
      return () => personalMuteListeners.delete(listener);
    },
  },
}));

beforeEach(() => {
  getMutedListMock.mockClear();
  personalMuteListeners.clear();
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [item('good', ['hive']), item('spammy', ['scrobblelife']), item('other', ['photography'])],
      hasMore: false,
    }),
  }) as Response);
});

describe('useDiscoveryCandidates mute-tag filtering', () => {
  it('excludes a candidate carrying a muted tag', async () => {
    const { result } = renderHook(() => useDiscoveryCandidates({ enabled: true, filter: MUTE_SCROBBLE }));

    await waitFor(() => expect(result.current.candidates.length).toBeGreaterThan(0));

    const permlinks = result.current.candidates.map(c => c.permlink);
    expect(permlinks).toContain('good');
    expect(permlinks).toContain('other');
    expect(permlinks).not.toContain('spammy');
  });

  it('includes everything when no tags are muted', async () => {
    const { result } = renderHook(() => useDiscoveryCandidates({ enabled: true }));

    await waitFor(() => expect(result.current.candidates.length).toBe(3));
  });

  it('re-filters an already-fetched pool instantly when a tag is muted, without a new fetch', async () => {
    const { result, rerender } = renderHook(
      ({ filter }) => useDiscoveryCandidates({ enabled: true, filter }),
      { initialProps: { filter: NONE } },
    );

    await waitFor(() => expect(result.current.candidates.length).toBe(3));
    const fetchCallsAfterInitialLoad = (global.fetch as any).mock.calls.length;

    rerender({ filter: MUTE_SCROBBLE });

    expect(result.current.candidates.map(c => c.permlink)).not.toContain('spammy');
    expect((global.fetch as any).mock.calls.length).toBe(fetchCallsAfterInitialLoad); // no extra network call
  });
});

describe('useDiscoveryCandidates personal mute filtering', () => {
  it('hides a personally muted author for a logged-in viewer', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          item('keep', ['hive'], 'goodauthor'),
          item('gone', ['hive'], 'spammer'),
          item('other', ['hive'], 'bob'),
        ],
        hasMore: false,
      }),
    }) as Response);

    const { result } = renderHook(() =>
      useDiscoveryCandidates({ enabled: true, username: 'viewer' }),
    );

    await waitFor(() => {
      expect(result.current.candidates.map(c => c.permlink)).toEqual(['keep', 'other']);
    });
    expect(getMutedListMock).toHaveBeenCalledWith('viewer');
  });

  it('drops a freshly muted author from the pool immediately', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          item('keep', ['hive'], 'goodauthor'),
          item('gone', ['hive'], 'newlymuted'),
        ],
        hasMore: false,
      }),
    }) as Response);

    const { result } = renderHook(() =>
      useDiscoveryCandidates({ enabled: true, username: 'viewer' }),
    );
    await waitFor(() => expect(result.current.candidates).toHaveLength(2));

    act(() => {
      personalMuteListeners.forEach(listener => listener('newlymuted'));
    });

    expect(result.current.candidates.map(c => c.permlink)).toEqual(['keep']);
  });
});
