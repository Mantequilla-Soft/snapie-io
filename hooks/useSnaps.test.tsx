// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSnaps } from './useSnaps';

// Same isolation/mocking approach as useComments.test.tsx.

vi.mock('./usePatronStatus', () => ({
  usePatronStatus: () => ({ byAccount: new Set<string>(), getTier: () => null, isLoading: false }),
}));

vi.mock('./useUserSettings', () => ({
  useUserSettings: () => ({ settings: { mutedTags: [] as string[] } }),
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: vi.fn(async () => new Set<string>()) },
}));

const databaseCallMock = vi.fn();
vi.mock('@/lib/hive/hiveclient', () => ({
  default: { database: { call: (...args: unknown[]) => databaseCallMock(...args) } },
}));

const getPostMock = vi.fn();
vi.mock('@/lib/hive/client-functions', () => ({
  getFollowing: vi.fn(async () => []),
  getPost: (...args: unknown[]) => getPostMock(...args),
}));

const COMMUNITY_TAG = 'testtag';

function container(permlink: string) {
  return { permlink, created: '2026-08-29T00:00:00', author: 'peak.snaps' };
}

function reply(permlink: string, overrides: Record<string, unknown> = {}) {
  return {
    author: 'someone',
    permlink,
    created: '2026-08-29T00:00:00',
    json_metadata: JSON.stringify({ tags: [COMMUNITY_TAG] }),
    active_votes: [],
    pending_payout_value: '0.000 HBD',
    total_payout_value: '0.000 HBD',
    curator_payout_value: '0.000 HBD',
    net_rshares: 0,
    ...overrides,
  };
}

beforeEach(() => {
  databaseCallMock.mockReset();
  getPostMock.mockReset();
  process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG = COMMUNITY_TAG;
});

describe('useSnaps.refreshComment', () => {
  it("patches only the matching comment's vote/payout fields, leaving others and array order untouched", async () => {
    // One container with two replies, both matching the community tag —
    // enough for a single fetch pass to populate `comments` (pageMinSize is
    // 10, but the walk stops once the container source is exhausted).
    databaseCallMock.mockImplementationOnce(() => Promise.resolve([container('c1')])); // get_discussions_by_author_before_date
    databaseCallMock.mockImplementationOnce(() => Promise.resolve([ // get_content_replies
      reply('target', { active_votes: [{ voter: 'alice' }] }),
      reply('bystander', { active_votes: [{ voter: 'bob' }] }),
    ]));
    databaseCallMock.mockImplementation(() => Promise.resolve([])); // no more containers — stop the walk

    const { result } = renderHook(() => useSnaps({ filterType: 'community' }));

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

    // pending_payout_value isn't declared on ExtendedComment's dhive-derived
    // type (same reason lib/hive/client-functions.ts's getPayoutValue takes
    // `post: any`) even though it's a real field on the actual JSON — cast
    // the same way for these reads.
    const [first, second] = result.current.comments as any[];
    // Order is preserved (map, not filter+push).
    expect(first.permlink).toBe('target');
    expect(second.permlink).toBe('bystander');

    // The targeted comment picked up the fresh data...
    expect(first.pending_payout_value).toBe('0.164 HBD');
    expect(first.active_votes).toHaveLength(2);

    // ...and the untouched one is genuinely untouched.
    expect(second.pending_payout_value).toBe('0.000 HBD');
    expect(second.active_votes).toHaveLength(1);

    expect(getPostMock).toHaveBeenCalledWith('someone', 'target');
  });

  it('leaves the existing data in place if the refetch fails', async () => {
    databaseCallMock.mockImplementationOnce(() => Promise.resolve([container('c1')])); // get_discussions_by_author_before_date
    databaseCallMock.mockImplementationOnce(() => Promise.resolve([reply('target')])); // get_content_replies
    databaseCallMock.mockImplementation(() => Promise.resolve([])); // no more containers — stop the walk

    const { result } = renderHook(() => useSnaps({ filterType: 'community' }));
    await waitFor(() => expect(result.current.comments).toHaveLength(1));

    getPostMock.mockRejectedValueOnce(new Error('node unreachable'));

    await act(async () => {
      await result.current.refreshComment('someone', 'target');
    });

    expect((result.current.comments[0] as any).pending_payout_value).toBe('0.000 HBD');
  });
});
