// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProfileSnaps } from './useProfileSnaps';

const getMutedListMock = vi.hoisted(() =>
  vi.fn(async (username?: string) => {
    if (username === 'viewer') return new Set(['spammer', 'profileuser']);
    return new Set<string>();
  }),
);

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: {
    getMutedList: (username?: string) => getMutedListMock(username),
    subscribePersonalMute: () => () => {},
  },
}));

const databaseCallMock = vi.fn();
vi.mock('@/lib/hive/hiveclient', () => ({
  default: { database: { call: (...args: unknown[]) => databaseCallMock(...args) } },
}));

vi.mock('@/lib/hive/client-functions', () => ({
  getPost: vi.fn(),
}));

function snap(permlink: string, author: string) {
  return {
    author,
    permlink,
    parent_author: 'peak.snaps',
    parent_permlink: 'container',
    created: '2026-08-29T00:00:00',
    json_metadata: '{}',
  };
}

beforeEach(() => {
  databaseCallMock.mockReset();
  getMutedListMock.mockClear();
});

describe('useProfileSnaps personal mute filtering', () => {
  it('keeps the profile owner visible even when the viewer muted them', async () => {
    databaseCallMock.mockResolvedValueOnce([
      snap('own-1', 'profileuser'),
      snap('spam-1', 'spammer'),
    ]);
    databaseCallMock.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useProfileSnaps('profileuser', [], 'viewer'),
    );

    await waitFor(() => {
      expect(result.current.comments.map(c => c.permlink)).toEqual(['own-1']);
    });
    expect(getMutedListMock).toHaveBeenCalledWith('viewer');
  });

  it('hides other muted authors that appear on the profile feed', async () => {
    databaseCallMock.mockResolvedValueOnce([
      snap('own-1', 'profileuser'),
      snap('spam-1', 'spammer'),
      snap('ok-1', 'friend'),
    ]);
    databaseCallMock.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useProfileSnaps('profileuser', [], 'viewer'),
    );

    await waitFor(() => {
      expect(result.current.comments.map(c => c.author)).toEqual(['profileuser', 'friend']);
    });
  });
});
