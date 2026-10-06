// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { resetMoodBadgeCacheForTests, useMoodBadges } from './useMoodBadges';
import { VIEWER_SESSION_EVENT } from '@/lib/auth/viewerSession';

function clearCookies() {
  document.cookie.split(';').forEach((part) => {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  });
}

describe('useMoodBadges session gate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearCookies();
    localStorage.clear();
    resetMoodBadgeCacheForTests();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tester: 'bull' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not request equipped badges when logged out', async () => {
    const { result } = renderHook(() => useMoodBadges());

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.getEquippedBadge('tester')).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('requests badges when a session marker is already present', async () => {
    document.cookie = 'snapieauth_csrf=abc';
    const { result } = renderHook(() => useMoodBadges());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/mood-badges/equipped');
    await waitFor(() => expect(result.current.getEquippedBadge('tester')).toBe('bull'));
  });

  it('starts the request after a session appears', async () => {
    const { result } = renderHook(() => useMoodBadges());
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();

    document.cookie = 'hive_username=tester';
    await act(async () => {
      window.dispatchEvent(new Event(VIEWER_SESSION_EVENT));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.getEquippedBadge('tester')).toBe('bull'));
  });
});
