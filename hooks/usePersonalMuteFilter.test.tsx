// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersonalMuteFilter } from './usePersonalMuteFilter';
import { UserProvider } from '@/contexts/UserContext';
import type { ReactNode } from 'react';

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
  personalMuteListeners.clear();
  getMutedListMock.mockClear();
});

describe('usePersonalMuteFilter', () => {
  it('loads the personal mute list for a logged-in viewer', async () => {
    const { result } = renderHook(() => usePersonalMuteFilter('viewer'));

    await waitFor(() => expect(result.current.mutedSet.has('spammer')).toBe(true));
    expect(getMutedListMock).toHaveBeenCalledWith('viewer');
    expect(result.current.isMutedAuthor('Spammer')).toBe(true);
    expect(result.current.filterMuted([
      { author: 'good' },
      { author: 'spammer' },
    ]).map(i => i.author)).toEqual(['good']);
  });

  it('loads the guest (community-only) list when no viewer is set', async () => {
    const { result } = renderHook(() => usePersonalMuteFilter(undefined));

    await waitFor(() => expect(getMutedListMock).toHaveBeenCalledWith(undefined));
    expect(result.current.mutedSet.size).toBe(0);
  });

  it('adds a freshly muted author via subscribePersonalMute', async () => {
    const { result } = renderHook(() => usePersonalMuteFilter('viewer'));
    await waitFor(() => expect(result.current.mutedSet.has('spammer')).toBe(true));

    act(() => {
      personalMuteListeners.forEach(listener => listener('newlymuted'));
    });

    expect(result.current.isMutedAuthor('newlymuted')).toBe(true);
  });

  it('falls back to the persisted Hive account (the one snap comments use) before the wallet session restores', async () => {
    localStorage.setItem('hiveuser', JSON.stringify({ name: 'viewer' }));
    const wrapper = ({ children }: { children: ReactNode }) => <UserProvider>{children}</UserProvider>;
    try {
      const { result } = renderHook(() => usePersonalMuteFilter(null), { wrapper });
      await waitFor(() => expect(result.current.mutedSet.has('spammer')).toBe(true));
      expect(getMutedListMock).toHaveBeenCalledWith('viewer');
    } finally {
      localStorage.removeItem('hiveuser');
    }
  });

  it('keeps a stable API between renders so effects that depend on it do not loop', async () => {
    const { result, rerender } = renderHook(() => usePersonalMuteFilter('viewer'));
    await waitFor(() => expect(result.current.mutedSet.has('spammer')).toBe(true));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
