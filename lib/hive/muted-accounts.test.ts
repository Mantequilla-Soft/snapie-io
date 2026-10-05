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

const callMock = vi.fn(async (api: string, method: string, _params: unknown) => hiveMuteResponse(api, method));

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { call: (...args: [string, string, unknown]) => callMock(...args) },
}));

async function freshManager() {
  vi.resetModules();
  const { mutedAccountsManager } = await import('./muted-accounts');
  return mutedAccountsManager;
}

function hiveMuteResponse(_api: string, method: string) {
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
}

beforeEach(() => {
  callMock.mockReset();
  callMock.mockImplementation(async (api: string, method: string) => hiveMuteResponse(api, method));
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

  it('does not write an in-flight pre-mute snapshot back after notifyPersonalMute', async () => {
    const manager = await freshManager();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    callMock.mockImplementation(async (api: string, method: string) => {
      await gate;
      return hiveMuteResponse(api, method);
    });

    const pending = manager.getMutedList('meno');
    manager.notifyPersonalMute('meno', 'FreshMute');
    release();
    const inFlight = await pending;

    // The waiter still sees the account that was just muted, but the 24h
    // snapshot from this fetch is not what gets stored.
    expect(inFlight.has('freshmute')).toBe(true);
    expect(localStorage.getItem('hive_muted_accounts_meno')).toBeNull();

    const storedPending = JSON.parse(localStorage.getItem('hive_pending_personal_mutes_meno')!);
    expect(storedPending).toEqual([expect.objectContaining({ name: 'freshmute' })]);

    const next = await manager.getMutedList('meno');
    expect(next.has('freshmute')).toBe(true);
    expect(next.has('personalfoe')).toBe(true);
    const cached = JSON.parse(localStorage.getItem('hive_muted_accounts_meno')!);
    expect(cached.accounts).toEqual(expect.arrayContaining(['freshmute', 'personalfoe', 'spambot']));
  });

  it('drops a cached 24h list on notifyPersonalMute and tells subscribers', async () => {
    const manager = await freshManager();
    await manager.getMutedList('meno');
    expect(localStorage.getItem('hive_muted_accounts_meno')).not.toBeNull();

    const seen: string[] = [];
    const unsubscribe = manager.subscribePersonalMute(author => seen.push(author));
    manager.notifyPersonalMute('meno', 'NewMute');
    unsubscribe();
    manager.notifyPersonalMute('meno', 'ignored');

    expect(localStorage.getItem('hive_muted_accounts_meno')).toBeNull();
    expect(seen).toEqual(['newmute']);
  });

  it('stops applying a pending mute after releasePersonalMute', async () => {
    const manager = await freshManager();
    manager.notifyPersonalMute('meno', 'freshmute');
    manager.releasePersonalMute('meno', 'FreshMute');

    const list = await manager.getMutedList('meno');
    expect(list.has('freshmute')).toBe(false);
    expect(list.has('personalfoe')).toBe(true);
    expect(localStorage.getItem('hive_pending_personal_mutes_meno')).toBeNull();
  });

  it('keeps a pending mute the follow index has not listed yet', async () => {
    const manager = await freshManager();
    localStorage.setItem('hive_pending_personal_mutes_meno', JSON.stringify([
      { name: 'freshmute', mutedAt: Date.now() },
    ]));

    const list = await manager.getMutedList('meno');
    expect(list.has('freshmute')).toBe(true);
    expect(list.has('personalfoe')).toBe(true);
    const stored = JSON.parse(localStorage.getItem('hive_pending_personal_mutes_meno')!);
    expect(stored).toEqual([expect.objectContaining({ name: 'freshmute' })]);
  });

  it('drops a pending mute once the follow index lists that account', async () => {
    const manager = await freshManager();
    manager.notifyPersonalMute('meno', 'personalfoe');

    const list = await manager.getMutedList('meno');
    expect(list.has('personalfoe')).toBe(true);
    expect(localStorage.getItem('hive_pending_personal_mutes_meno')).toBeNull();
  });

  it('does not reapply an expired pending mute missing from the follow index', async () => {
    const manager = await freshManager();
    localStorage.setItem('hive_pending_personal_mutes_meno', JSON.stringify([
      { name: 'freshmute', mutedAt: 0 },
    ]));

    const list = await manager.getMutedList('meno');
    expect(list.has('freshmute')).toBe(false);
    expect(list.has('personalfoe')).toBe(true);
    expect(localStorage.getItem('hive_pending_personal_mutes_meno')).toBeNull();
  });

  it('does not let a legacy untimestamped pending mute override an authoritative list', async () => {
    const manager = await freshManager();
    localStorage.setItem('hive_pending_personal_mutes_meno', JSON.stringify(['freshmute']));

    const list = await manager.getMutedList('meno');
    expect(list.has('freshmute')).toBe(false);
    expect(localStorage.getItem('hive_pending_personal_mutes_meno')).toBeNull();
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
