// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePointsSummary } from './usePointsSummary';
import { VIEWER_SESSION_EVENT } from '@/lib/auth/viewerSession';

function clearCookies() {
  document.cookie.split(';').forEach((part) => {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  });
}

const SUMMARY = { balance: 10, lifetimeEarned: 25, rank: 3 };

describe('usePointsSummary session gate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearCookies();
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => SUMMARY });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch a profile summary when the viewer is logged out', async () => {
    const { result } = renderHook(() => usePointsSummary('meno'));

    await act(async () => { await Promise.resolve(); });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('fetches once a session marker exists', async () => {
    localStorage.setItem('hiveuser', '{"name":"meno"}');
    const { result } = renderHook(() => usePointsSummary('meno'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/points/summary?username=meno');
    await waitFor(() => expect(result.current).toEqual(SUMMARY));
  });

  it('fetches after login on an already-mounted profile', async () => {
    const { result } = renderHook(() => usePointsSummary('meno'));
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();

    document.cookie = 'snapieauth_csrf=abc';
    await act(async () => {
      window.dispatchEvent(new Event(VIEWER_SESSION_EVENT));
    });

    await waitFor(() => expect(result.current).toEqual(SUMMARY));
  });
});
