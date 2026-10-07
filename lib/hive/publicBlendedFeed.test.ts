import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPublicBlendedPage } from './publicBlendedFeed';
import { PUBLIC_SNAP_SEED_COUNT } from './publicSnapPage';

const fetchSidecarFeedMock = vi.fn();
const getMutedListMock = vi.fn(async (..._args: unknown[]) => new Set<string>());

vi.mock('@/lib/discovery/sidecarClient', () => ({
  fetchSidecarFeed: (...args: unknown[]) => fetchSidecarFeedMock(...args),
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: (...args: unknown[]) => getMutedListMock(...args) },
}));

function item(permlink: string, extra: Record<string, unknown> = {}) {
  return {
    source: 'snap' as const,
    author: 'alice',
    permlink,
    created: '2026-08-29T00:00:00',
    parentAuthor: 'peak.snaps',
    parentPermlink: 'c1',
    body: `hello ${permlink}`,
    children: 2,
    json_metadata: JSON.stringify({
      tags: ['snapie'],
      app: 'snapie/1.0',
      image: ['https://example.test/huge.jpg'],
    }),
    active_votes: [
      { voter: 'a', percent: 10000, rshares: 1, reputation: 0, time: '', weight: 0 },
      { voter: 'b', percent: 10000, rshares: 1, reputation: 0, time: '', weight: 0 },
    ],
    pending_payout_value: '0.100 HBD',
    total_payout_value: '0.000 HBD',
    curator_payout_value: '0.000 HBD',
    net_rshares: 999,
    ...extra,
  };
}

beforeEach(() => {
  fetchSidecarFeedMock.mockReset();
  getMutedListMock.mockReset();
  getMutedListMock.mockResolvedValue(new Set<string>());
});

describe('fetchPublicBlendedPage', () => {
  it('seeds the newest sidecar page, drops community mutes, and slims card fields', async () => {
    getMutedListMock.mockResolvedValue(new Set(['muteduser']));
    fetchSidecarFeedMock.mockResolvedValue({
      items: [
        item('new', { created: '2026-08-29T00:02:00', source: 'wave' }),
        item('muted', { author: 'muteduser', created: '2026-08-29T00:01:00' }),
        item('old', { created: '2026-08-29T00:00:00' }),
        item('new', { created: '2026-08-29T00:02:00', source: 'wave' }),
      ],
      hasMore: true,
    });

    const page = await fetchPublicBlendedPage();

    expect(getMutedListMock).toHaveBeenCalledWith(undefined);
    expect(fetchSidecarFeedMock).toHaveBeenCalledWith({ limit: PUBLIC_SNAP_SEED_COUNT });
    expect(page?.comments.map(c => c.permlink)).toEqual(['new', 'old']);
    expect(page?.comments[0].source).toBe('wave');
    expect(page?.comments[0].parent_author).toBe('peak.snaps');
    expect(page?.comments[0].parent_permlink).toBe('c1');
    expect(page?.comments[0].voteCount).toBe(2);
    expect(page?.comments[0].active_votes).toBeUndefined();
    expect(JSON.parse(page!.comments[0].json_metadata)).toEqual({ tags: ['snapie'] });
    expect(page?.comments[0]).not.toHaveProperty('net_rshares');
    expect((page?.comments[0] as { pending_payout_value?: string }).pending_payout_value).toBe('0.100 HBD');
    expect(page?.before).toBe('2026-08-29T00:00:00');
    expect(page?.cursor).toBeNull();
    expect(page?.hasMore).toBe(true);
  });

  it('returns null when the sidecar has nothing to paint', async () => {
    fetchSidecarFeedMock.mockResolvedValue({ items: [], hasMore: false });
    await expect(fetchPublicBlendedPage()).resolves.toBeNull();
  });

  it('returns null when every item is community-muted', async () => {
    getMutedListMock.mockResolvedValue(new Set(['alice']));
    fetchSidecarFeedMock.mockResolvedValue({ items: [item('a')], hasMore: false });
    await expect(fetchPublicBlendedPage()).resolves.toBeNull();
  });
});
