import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mutedAccountsManager is a module-scoped singleton, so each test dynamically
// re-imports the module after vi.resetModules() to start from a clean cache —
// same isolation concern noted in snapTrending.mutes.test.ts.

class LocalStorageMock {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

const callMock = vi.fn(async (_api: string, method: string, _params: unknown) => {
  if (method === 'list_community_roles') {
    return [
      ['spambot', 'muted', ''],
      ['goodmod', 'mod', ''],
    ];
  }
  if (method === 'get_follow_list') {
    return [{ name: 'personalfoe' }];
  }
  return [];
});

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { call: (...args: [string, string, unknown]) => callMock(...args) },
}));

async function freshManager() {
  vi.resetModules();
  const { mutedAccountsManager } = await import('./muted-accounts');
  return mutedAccountsManager;
}

beforeEach(() => {
  callMock.mockClear();
  process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG = 'testtag';
  // muted-accounts.ts branches on `typeof window === 'undefined'`; the suite
  // runs under vitest's node environment, so stub just enough to exercise
  // the localStorage paths.
  (global as any).window = global;
  (global as any).localStorage = new LocalStorageMock();
});

afterEach(() => {
  delete (global as any).window;
  delete (global as any).localStorage;
});

describe('mutedAccountsManager.getMutedList', () => {
  it('merges community-muted and personally-muted accounts, lowercased', async () => {
    const manager = await freshManager();
    const list = await manager.getMutedList('meno');
    expect(list.has('spambot')).toBe(true);
    expect(list.has('personalfoe')).toBe(true);
    expect(list.has('goodmod')).toBe(false);
  });

  it('only fetches community mutes when no username is given', async () => {
    const manager = await freshManager();
    const list = await manager.getMutedList();
    expect(list.has('spambot')).toBe(true);
    expect(list.has('personalfoe')).toBe(false);
    expect(callMock).toHaveBeenCalledTimes(1);
    expect(callMock).toHaveBeenCalledWith('bridge', 'list_community_roles', expect.anything());
  });

  it('returns an empty set when no community tag is configured, without calling the API', async () => {
    delete process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;
    const manager = await freshManager();
    const list = await manager.getMutedList();
    expect(list.size).toBe(0);
    expect(callMock).not.toHaveBeenCalled();
  });

  it('caches the combined result in memory — a second call does not refetch', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    const callsAfterFirst = callMock.mock.calls.length;
    await manager.getMutedList('meno');
    expect(callMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('dedupes concurrent in-flight requests for the same user', async () => {
    const manager = await freshManager();
    const [a, b] = await Promise.all([manager.getMutedList('meno'), manager.getMutedList('meno')]);
    expect(a).toBe(b); // same Set instance, i.e. same resolved promise
    expect(callMock.mock.calls.length).toBe(2); // one list_community_roles + one get_follow_list
  });

  it('persists the fetched list to localStorage', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    const raw = localStorage.getItem('hive_muted_accounts_meno');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).accounts).toEqual(expect.arrayContaining(['spambot', 'personalfoe']));
  });

  it('falls back to a stale localStorage cache if the API call fails', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno'); // primes localStorage with a good entry
    const key = 'hive_muted_accounts_meno';
    const stale = JSON.parse(localStorage.getItem(key)!);
    stale.timestamp = 0; // force TTL expiry
    localStorage.setItem(key, JSON.stringify(stale));

    const manager2 = await freshManager(); // fresh in-memory cache, only stale localStorage remains
    callMock.mockRejectedValueOnce(new Error('node unreachable'));
    const list = await manager2.getMutedList('meno');
    expect(list.has('spambot')).toBe(true);
    expect(list.has('personalfoe')).toBe(true);
  });
});

describe('mutedAccountsManager.isMuted', () => {
  it('performs a case-insensitive lookup', async () => {
    const manager = await freshManager();
    expect(await manager.isMuted('SpamBot', 'meno')).toBe(true);
    expect(await manager.isMuted('GoodMod', 'meno')).toBe(false);
  });
});

describe('mutedAccountsManager.clearCache', () => {
  it('forces a refetch for the given user on the next call', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    const callsAfterFirst = callMock.mock.calls.length;

    manager.clearCache('meno');
    await manager.getMutedList('meno');

    expect(callMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('removes the persisted localStorage entry for that user', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    expect(localStorage.getItem('hive_muted_accounts_meno')).not.toBeNull();

    manager.clearCache('meno');
    expect(localStorage.getItem('hive_muted_accounts_meno')).toBeNull();
  });

  it('leaves other users\' cached lists untouched', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    await manager.getMutedList('other');
    const callsAfterBoth = callMock.mock.calls.length;

    manager.clearCache('meno');
    await manager.getMutedList('other'); // should still be cached
    expect(callMock.mock.calls.length).toBe(callsAfterBoth);

    await manager.getMutedList('meno'); // should have refetched
    expect(callMock.mock.calls.length).toBeGreaterThan(callsAfterBoth);
  });

  it('with no argument clears every cached user', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    await manager.getMutedList('other');
    const callsAfterBoth = callMock.mock.calls.length;

    manager.clearCache();
    await manager.getMutedList('meno');
    await manager.getMutedList('other');

    expect(callMock.mock.calls.length).toBeGreaterThan(callsAfterBoth * 2 - 1);
  });
});
