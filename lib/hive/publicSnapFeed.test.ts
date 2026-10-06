import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPublicSnapPage } from './publicSnapFeed';
import { PUBLIC_SNAP_SEED_COUNT } from './publicSnapPage';

const databaseCallMock = vi.fn();
const getMutedListMock = vi.fn(async (..._args: unknown[]) => new Set<string>());

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { database: { call: (...args: unknown[]) => databaseCallMock(...args) } },
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: (...args: unknown[]) => getMutedListMock(...args) },
}));

function container(permlink: string, created = '2026-08-29T00:00:00') {
  return { permlink, created, author: 'peak.snaps' };
}

function reply(author: string, permlink: string, extra: Record<string, unknown> = {}) {
  return {
    author,
    permlink,
    created: '2026-08-29T00:00:00',
    body: `hello from ${author}`,
    children: 2,
    parent_author: 'peak.snaps',
    parent_permlink: 'c1',
    title: '',
    json_metadata: JSON.stringify({
      tags: ['snapie'],
      app: 'snapie/1.0',
      image: ['https://example.test/huge.jpg'],
      extra: 'x'.repeat(500),
    }),
    active_votes: [
      { voter: 'a', percent: 10000, rshares: 1, reputation: 0, time: '', weight: 0 },
      { voter: 'b', percent: 10000, rshares: 1, reputation: 0, time: '', weight: 0 },
      { voter: 'c', percent: 10000, rshares: 1, reputation: 0, time: '', weight: 0 },
    ],
    pending_payout_value: '0.100 HBD',
    total_payout_value: '0.000 HBD',
    curator_payout_value: '0.000 HBD',
    net_rshares: 999,
    ...extra,
  };
}

beforeEach(() => {
  databaseCallMock.mockReset();
  getMutedListMock.mockReset();
  getMutedListMock.mockResolvedValue(new Set<string>());
});

describe('fetchPublicSnapPage', () => {
  it('walks peak.snaps one container at a time and drops community mutes', async () => {
    getMutedListMock.mockResolvedValue(new Set(['muteduser']));
    databaseCallMock
      .mockResolvedValueOnce([container('c1', '2026-08-29T00:00:00')])
      .mockResolvedValueOnce([reply('alice', 'a'), reply('muteduser', 'm'), reply('bob', 'b')])
      .mockResolvedValueOnce([]);

    const page = await fetchPublicSnapPage();

    expect(getMutedListMock).toHaveBeenCalledWith(undefined);
    const first = databaseCallMock.mock.calls[0];
    expect(first[0]).toBe('get_discussions_by_author_before_date');
    expect(first[1][0]).toBe('peak.snaps');
    expect(first[1][3]).toBe(1);
    expect(page.comments.map(c => c.permlink)).toEqual(['a', 'b']);
    expect(page.cursor).toEqual({ permlink: 'c1', date: '2026-08-29T00:00:00' });
    expect(page.hasMore).toBe(false);
  });

  it('seeds the newest viewport and leaves the cursor at the head when the container is longer', async () => {
    const replies = Array.from({ length: PUBLIC_SNAP_SEED_COUNT + 5 }, (_, i) =>
      reply('alice', `p${i}`, { created: `2026-08-29T00:${String(i).padStart(2, '0')}:00` })
    );
    databaseCallMock
      .mockResolvedValueOnce([container('c1')])
      .mockResolvedValueOnce(replies);

    const page = await fetchPublicSnapPage();

    const newest = [...replies].sort((a, b) => (a.created < b.created ? 1 : -1));
    expect(page.comments).toHaveLength(PUBLIC_SNAP_SEED_COUNT);
    expect(page.comments.map(c => c.permlink)).toEqual(
      newest.slice(0, PUBLIC_SNAP_SEED_COUNT).map(c => c.permlink)
    );
    expect(page.cursor).toBeNull();
    expect(page.hasMore).toBe(true);
    // Did not ask for a second container.
    expect(databaseCallMock).toHaveBeenCalledTimes(2);
    const seeded = page.comments[0];
    expect(seeded.voteCount).toBe(3);
    expect(seeded.active_votes).toBeUndefined();
    expect(JSON.parse(seeded.json_metadata)).toEqual({ tags: ['snapie'] });
    expect(seeded).not.toHaveProperty('net_rshares');
    expect((seeded as unknown as { pending_payout_value?: string }).pending_payout_value).toBe('0.100 HBD');
    expect(seeded.body).toBe('hello from alice');
  });

  it('points the cursor at the last fully consumed container when the seed spills into the next one', async () => {
    const first = [reply('alice', 'a'), reply('bob', 'b')];
    const second = Array.from({ length: PUBLIC_SNAP_SEED_COUNT }, (_, i) => reply('carol', `s${i}`));
    databaseCallMock
      .mockResolvedValueOnce([container('c1', '2026-08-29T00:00:00')])
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([container('c2', '2026-08-28T00:00:00')])
      .mockResolvedValueOnce(second);

    const page = await fetchPublicSnapPage();

    expect(page.comments.map(c => c.permlink)).toEqual([
      'a',
      'b',
      ...second.slice(0, PUBLIC_SNAP_SEED_COUNT - 2).map(c => c.permlink),
    ]);
    expect(page.cursor).toEqual({ permlink: 'c1', date: '2026-08-29T00:00:00' });
    expect(page.hasMore).toBe(true);
  });

  it('rejects when the container walk fails so the caller can fall back', async () => {
    databaseCallMock.mockRejectedValueOnce(new Error('node down'));
    await expect(fetchPublicSnapPage()).rejects.toThrow('node down');
  });
});
