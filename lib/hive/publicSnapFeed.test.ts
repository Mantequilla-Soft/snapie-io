import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPublicSnapPage } from './publicSnapFeed';

const databaseCallMock = vi.fn();
const getMutedListMock = vi.fn(async () => new Set<string>());

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { database: { call: (...args: unknown[]) => databaseCallMock(...args) } },
}));

vi.mock('@/lib/hive/muted-accounts', () => ({
  mutedAccountsManager: { getMutedList: (...args: unknown[]) => getMutedListMock(...args) },
}));

function container(permlink: string, created = '2026-08-29T00:00:00') {
  return { permlink, created, author: 'peak.snaps' };
}

function reply(author: string, permlink: string) {
  return { author, permlink, created: '2026-08-29T00:00:00', body: `hello from ${author}`, active_votes: [] };
}

beforeEach(() => {
  databaseCallMock.mockReset();
  getMutedListMock.mockReset();
  getMutedListMock.mockResolvedValue(new Set<string>());
});

describe('fetchPublicSnapPage', () => {
  it('walks peak.snaps the same way the client first page does and drops community mutes', async () => {
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
    expect(first[1][3]).toBe(3);
    expect(page.comments.map(c => c.permlink)).toEqual(['a', 'b']);
    expect(page.cursor).toEqual({ permlink: 'c1', date: '2026-08-29T00:00:00' });
    expect(page.hasMore).toBe(false);
  });

  it('rejects when the container walk fails so the caller can fall back', async () => {
    databaseCallMock.mockRejectedValueOnce(new Error('node down'));
    await expect(fetchPublicSnapPage()).rejects.toThrow('node down');
  });
});
