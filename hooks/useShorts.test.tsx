// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShorts } from './useShorts';

// useShorts pulls from a third-party API (checker.3speak.tv) and previously
// had zero mute awareness at all — a muted author's shorts kept showing up
// forever, and the ShortCard "Mute" action didn't remove already-loaded
// shorts either. These tests cover both fixes.

function shortsApiPage(entries: { author: string; permlink: string }[], page = 1, totalPages = 1) {
  return {
    page,
    totalPages,
    shorts: entries.map((e, i) => ({
      embed_url: `@${e.author}/${e.permlink}`,
      owner: e.author,
      permlink: e.permlink,
      thumbnail_url: '',
      hive_title: `title-${i}`,
      views: 0,
      createdAt: new Date().toISOString(),
      hive_votes: 0,
      hive_comments: 0,
      hive_reward: 0,
    })),
  };
}

const mutedListMock = vi.fn(async (username?: string) => {
  if (username === 'meno') return new Set(['spammer']);
  return new Set<string>();
});

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: (username?: string) => mutedListMock(username) },
}));

beforeEach(() => {
  mutedListMock.mockClear();
  global.fetch = vi.fn(async () =>
    ({ ok: true, json: async () => shortsApiPage([
      { author: 'goodauthor', permlink: 'p1' },
      { author: 'spammer', permlink: 'p2' },
    ]) }) as Response,
  );
});

describe('useShorts mute filtering', () => {
  it('includes every author when no username is given (guest)', async () => {
    const { result } = renderHook(() => useShorts());
    await act(async () => {
      await result.current.load(true);
    });
    const authors = result.current.shorts.map(s => s.author);
    expect(authors).toContain('goodauthor');
    expect(authors).toContain('spammer');
  });

  it('excludes an author the viewer has muted', async () => {
    const { result } = renderHook(() => useShorts('meno'));
    await act(async () => {
      await result.current.load(true);
    });
    const authors = result.current.shorts.map(s => s.author);
    expect(authors).toContain('goodauthor');
    expect(authors).not.toContain('spammer');
  });

  it('removeAuthor drops all of an author\'s already-loaded shorts immediately', async () => {
    global.fetch = vi.fn(async () =>
      ({ ok: true, json: async () => shortsApiPage([
        { author: 'goodauthor', permlink: 'p1' },
        { author: 'newlymuted', permlink: 'p2' },
        { author: 'newlymuted', permlink: 'p3' },
      ]) }) as Response,
    );
    const { result } = renderHook(() => useShorts());
    await act(async () => {
      await result.current.load(true);
    });
    expect(result.current.shorts.map(s => s.author)).toEqual(
      expect.arrayContaining(['goodauthor', 'newlymuted']),
    );

    act(() => {
      result.current.removeAuthor('newlymuted');
    });

    const authors = result.current.shorts.map(s => s.author);
    expect(authors).toContain('goodauthor');
    expect(authors).not.toContain('newlymuted');
  });

  it('does not reload the whole feed when username becomes available after mount', async () => {
    const { result, rerender } = renderHook(({ username }) => useShorts(username), {
      initialProps: { username: undefined as string | undefined },
    });
    const initialLoad = result.current.load;

    rerender({ username: 'meno' });

    expect(result.current.load).toBe(initialLoad); // stable identity across the auth-hydration transition
  });
});
