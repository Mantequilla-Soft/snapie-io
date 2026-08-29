// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBlendedFeed } from './useBlendedFeed';

// Same isolation/mocking approach as useSnaps.test.tsx — useBlendedFeed
// seeds its initial data from `/api/feed` (the sidecar proxy) rather than
// HiveClient directly, but refreshComment still goes through getPost like
// every other data source.

vi.mock('./useUserSettings', () => ({
  useUserSettings: () => ({ settings: { mutedTags: [] as string[] } }),
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: vi.fn(async () => new Set<string>()) },
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
