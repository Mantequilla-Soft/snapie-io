// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserRelationship } from './useUserRelationship';

// This hook is the only place that broadcasts a personal mute/blacklist
// change. It MUST invalidate mutedAccountsManager's cache on success —
// otherwise every feed keeps showing (or hiding) the target account for up
// to the cache's 24h TTL. See lib/hive/muted-accounts.test.ts for the cache
// mechanics themselves; this file only asserts the wiring.

const getRelationshipBetweenAccounts = vi.fn();
const setUserRelationship = vi.fn();
vi.mock('@/lib/hive/client-functions', () => ({
  getRelationshipBetweenAccounts: (...args: unknown[]) => getRelationshipBetweenAccounts(...args),
  setUserRelationship: (...args: unknown[]) => setUserRelationship(...args),
}));

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ username: 'meno', isLoggedIn: true, isSnapie: false, logout: vi.fn() }),
}));

const clearCache = vi.fn();
const notifyPersonalMute = vi.fn();
const releasePersonalMute = vi.fn();
vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: {
    clearCache: (...args: unknown[]) => clearCache(...args),
    notifyPersonalMute: (viewer: string, author: string) => notifyPersonalMute(viewer, author),
    releasePersonalMute: (viewer: string, author: string) => releasePersonalMute(viewer, author),
  },
}));

vi.mock('@chakra-ui/react', () => ({
  useToast: () => vi.fn(),
}));

beforeEach(() => {
  getRelationshipBetweenAccounts.mockReset().mockResolvedValue({ follows: false, ignores: false, blacklists: false });
  setUserRelationship.mockReset().mockResolvedValue(true);
  clearCache.mockReset();
  notifyPersonalMute.mockReset();
  releasePersonalMute.mockReset();
});

describe('useUserRelationship mute/blacklist cache invalidation', () => {
  it('notifies feeds and drops the 24h mute cache after a successful mute', async () => {
    const { result } = renderHook(() => useUserRelationship('spammer'));

    await act(async () => {
      await result.current.handleMute();
    });

    expect(setUserRelationship).toHaveBeenCalledWith('meno', 'spammer', 'ignore');
    expect(notifyPersonalMute).toHaveBeenCalledWith('meno', 'spammer');
    expect(releasePersonalMute).not.toHaveBeenCalled();
    expect(result.current.isMuted).toBe(true);
  });

  it('clears the cache again on unmute', async () => {
    getRelationshipBetweenAccounts.mockResolvedValue({ follows: false, ignores: true, blacklists: false });
    const { result } = renderHook(() => useUserRelationship('spammer'));
    await act(async () => {
      await result.current.fetchRelationship();
    });
    expect(result.current.isMuted).toBe(true);

    await act(async () => {
      await result.current.handleMute();
    });

    expect(setUserRelationship).toHaveBeenCalledWith('meno', 'spammer', '');
    expect(releasePersonalMute).toHaveBeenCalledWith('meno', 'spammer');
    expect(notifyPersonalMute).not.toHaveBeenCalled();
    expect(result.current.isMuted).toBe(false);
  });

  it('clears the cache after a successful blacklist', async () => {
    const { result } = renderHook(() => useUserRelationship('spammer'));

    await act(async () => {
      await result.current.handleBlacklist();
    });

    expect(setUserRelationship).toHaveBeenCalledWith('meno', 'spammer', 'blacklist');
    expect(clearCache).toHaveBeenCalledWith('meno');
  });

  it('does NOT clear the cache when the broadcast fails', async () => {
    setUserRelationship.mockResolvedValue(false);
    const { result } = renderHook(() => useUserRelationship('spammer'));

    await act(async () => {
      await result.current.handleMute();
    });

    expect(clearCache).not.toHaveBeenCalled();
    expect(notifyPersonalMute).not.toHaveBeenCalled();
    expect(releasePersonalMute).not.toHaveBeenCalled();
    expect(result.current.isMuted).toBe(false); // optimistic state never flipped
  });

  it('does nothing when no user is logged in', async () => {
    // Re-mock useCurrentUser for this one test to simulate a logged-out viewer.
    vi.doMock('@/hooks/useCurrentUser', () => ({
      useCurrentUser: () => ({ username: null, isLoggedIn: false, isSnapie: false, logout: vi.fn() }),
    }));
    vi.resetModules();
    const { useUserRelationship: freshHook } = await import('./useUserRelationship');
    const { result } = renderHook(() => freshHook('spammer'));

    await act(async () => {
      await result.current.handleMute();
    });

    expect(setUserRelationship).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(notifyPersonalMute).not.toHaveBeenCalled();
  });
});
