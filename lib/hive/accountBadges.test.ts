import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Module-level cache means state persists across `it()` blocks within one
// test file (vitest gives a fresh module registry per FILE, not per test) —
// each test dynamically re-imports after vi.resetModules() to start clean,
// same isolation approach as lib/discovery/snapTrending.mutes.test.ts.

const lookupAccountsMock = vi.fn();
const getAccountsMock = vi.fn();
const databaseCallMock = vi.fn();
vi.mock('@/lib/hive/hiveclient', () => ({
  default: {
    call: (api: string, method: string, params: unknown[]) => lookupAccountsMock(api, method, params),
    database: {
      getAccounts: (names: string[]) => getAccountsMock(names),
      call: (method: string, params: unknown[]) => databaseCallMock(method, params),
    },
  },
}));

// getFollowing(account, start, limit) via HiveClient.database.call('get_following', [account, start, 'blog', limit])
// -> [{ following }, ...]. Tests drive this through a getFollowingMock keyed
// the same way the real getFollowingPage() is, for readability.
const getFollowingMock = vi.fn();
databaseCallMock.mockImplementation(async (method: string, params: unknown[]) => {
  if (method !== 'get_following') return [];
  const [account, start, , limit] = params as [string, string, string, number];
  const names: string[] = await getFollowingMock(account, start, limit);
  return names.map(following => ({ following }));
});

function profileMetadata(name: string, about: string, image: string) {
  return JSON.stringify({ profile: { name, about, profile_image: image } });
}

async function freshModule() {
  vi.resetModules();
  return import('./accountBadges');
}

beforeEach(() => {
  lookupAccountsMock.mockReset();
  getAccountsMock.mockReset();
  getFollowingMock.mockReset();
  databaseCallMock.mockClear(); // keep the get_following -> getFollowingMock bridge, just clear call history
});

describe('fetchBadgeCatalog (via getBadgesForUser)', () => {
  it('stops at the first non-"badge-" name and never includes it', async () => {
    // Mirrors the real lookup_accounts('badge-', 1000) behavior confirmed
    // live: results are a plain alphabetical walk from the start cursor,
    // not a true prefix filter, so real non-"badge-" names show up once the
    // walk passes the badge- region.
    lookupAccountsMock.mockResolvedValue([
      'badge-100', 'badge-200', 'badge-zzz', 'badgex-not-a-badge', 'badz-other',
    ]);
    getAccountsMock.mockResolvedValue([
      { name: 'badge-100', posting_json_metadata: profileMetadata('Alpha', 'desc-a', 'img-a') },
      { name: 'badge-200', posting_json_metadata: profileMetadata('Beta', 'desc-b', 'img-b') },
      { name: 'badge-zzz', posting_json_metadata: profileMetadata('Zulu', 'desc-z', 'img-z') },
    ]);
    getFollowingMock.mockResolvedValue([]);

    const { getBadgesForUser } = await freshModule();
    await getBadgesForUser('nobody');

    // getAccounts should only ever have been asked about real badge- names.
    const namesQueried: string[] = getAccountsMock.mock.calls[0][0];
    expect(namesQueried.sort()).toEqual(['badge-100', 'badge-200', 'badge-zzz']);
    expect(namesQueried).not.toContain('badgex-not-a-badge');
    expect(namesQueried).not.toContain('badz-other');
  });
});

describe('getBadgesForUser', () => {
  it('returns the right badges for a holder, and [] for someone who holds none', async () => {
    lookupAccountsMock.mockResolvedValue(['badge-100', 'badge-200', 'not-a-badge']);
    getAccountsMock.mockResolvedValue([
      { name: 'badge-100', posting_json_metadata: profileMetadata('Alpha', 'desc-a', 'img-a') },
      { name: 'badge-200', posting_json_metadata: profileMetadata('Beta', 'desc-b', 'img-b') },
    ]);
    getFollowingMock.mockImplementation(async (account: string) => {
      if (account === 'badge-100') return ['alice', 'bob'];
      if (account === 'badge-200') return ['bob'];
      return [];
    });

    const { getBadgesForUser } = await freshModule();

    const aliceBadges = await getBadgesForUser('alice');
    expect(aliceBadges.map(b => b.account)).toEqual(['badge-100']);
    expect(aliceBadges[0]).toEqual({ account: 'badge-100', name: 'Alpha', about: 'desc-a', image: 'img-a' });

    const bobBadges = (await getBadgesForUser('BOB')).map(b => b.account).sort(); // case-insensitive
    expect(bobBadges).toEqual(['badge-100', 'badge-200']);

    expect(await getBadgesForUser('nobody-holds-anything')).toEqual([]);
  });

  it('falls back to the bare account name when profile metadata is missing or malformed', async () => {
    lookupAccountsMock.mockResolvedValue(['badge-100']);
    getAccountsMock.mockResolvedValue([{ name: 'badge-100', posting_json_metadata: 'not valid json' }]);
    getFollowingMock.mockResolvedValue(['alice']);

    const { getBadgesForUser } = await freshModule();
    const badges = await getBadgesForUser('alice');
    expect(badges).toEqual([{ account: 'badge-100', name: 'badge-100', about: '', image: '' }]);
  });

  it('de-dupes a holder that reappears across a paginated get_following boundary', async () => {
    // Hive's start-cursor is inclusive — the boundary account legitimately
    // comes back as the first item of the next page too.
    lookupAccountsMock.mockResolvedValue(['badge-100']);
    getAccountsMock.mockResolvedValue([{ name: 'badge-100', posting_json_metadata: profileMetadata('A', '', '') }]);
    const page1 = Array.from({ length: 1000 }, (_, i) => (i === 999 ? 'boundary-user' : `user${i}`));
    getFollowingMock
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(['boundary-user', 'trailing-user']); // re-includes the boundary account

    const { getBadgesForUser } = await freshModule();
    expect(await getBadgesForUser('boundary-user')).toHaveLength(1); // not duplicated
    expect(await getBadgesForUser('trailing-user')).toHaveLength(1);
    expect(getFollowingMock).toHaveBeenCalledTimes(2); // paginated to completion, no more, no less
  });
});

describe('cache: stale-while-revalidate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves the stale cache immediately on expiry (does not block on a rebuild), then reflects fresh data after it completes', async () => {
    lookupAccountsMock.mockResolvedValue(['badge-100']);
    getAccountsMock.mockResolvedValue([{ name: 'badge-100', posting_json_metadata: profileMetadata('Old', '', '') }]);
    getFollowingMock.mockResolvedValue(['alice']);

    const { getBadgesForUser } = await freshModule();
    expect((await getBadgesForUser('alice'))[0].name).toBe('Old');

    // Past the 24h TTL.
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));

    // Change what a fresh build would produce, but hold it open with a
    // deferred promise so we can prove the caller doesn't wait on it.
    let resolveRebuild!: () => void;
    const rebuildGate = new Promise<void>(r => { resolveRebuild = r; });
    getFollowingMock.mockImplementation(async () => {
      await rebuildGate;
      return ['alice'];
    });
    getAccountsMock.mockResolvedValue([{ name: 'badge-100', posting_json_metadata: profileMetadata('New', '', '') }]);

    const staleResult = await getBadgesForUser('alice');
    expect(staleResult[0].name).toBe('Old'); // served instantly from the old cache

    resolveRebuild();
    await vi.waitFor(async () => {
      expect((await getBadgesForUser('alice'))[0].name).toBe('New');
    });
  });

  it('blocks on a cold cache (nothing built yet) since there is nothing stale to serve', async () => {
    lookupAccountsMock.mockResolvedValue(['badge-100']);
    getAccountsMock.mockResolvedValue([{ name: 'badge-100', posting_json_metadata: profileMetadata('Only', '', '') }]);
    getFollowingMock.mockResolvedValue(['alice']);

    const { getBadgesForUser } = await freshModule();
    const result = await getBadgesForUser('alice'); // no prior cache — must await the real build
    expect(result[0].name).toBe('Only');
  });
});
