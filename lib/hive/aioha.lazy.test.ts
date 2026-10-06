// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadRealAioha = vi.fn();

vi.mock('@/lib/aioha/load-real', () => ({
  loadRealAioha: () => loadRealAioha(),
}));

vi.mock('./hiveclient', () => ({
  fetchHealthyNodes: vi.fn(async () => []),
}));

function fakeAioha() {
  const listeners = new Map<string, Set<() => void>>();
  let user: string | undefined;
  return {
    registerKeychain: vi.fn(),
    registerLedger: vi.fn(),
    registerPeakVault: vi.fn(),
    registerHiveAuth: vi.fn(),
    registerHiveSigner: vi.fn(),
    setApi: vi.fn(),
    loadAuth: vi.fn(() => {
      user = 'alice';
      return true;
    }),
    getCurrentUser: () => user,
    getCurrentProvider: () => 'keychain',
    isLoggedIn: () => !!user,
    on: (event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off: (event: string, cb: () => void) => listeners.get(event)?.delete(cb),
    logout: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  loadRealAioha.mockReset();
  localStorage.clear();
});

describe('lazy aioha', () => {
  it('does not load the library until a caller needs it', async () => {
    const mod = await import('./aioha');
    expect(loadRealAioha).not.toHaveBeenCalled();
    expect(mod.hasStoredAiohaSession()).toBe(false);
    expect(mod.isLoggedIn()).toBe(false);
    expect(mod.getCurrentUser()).toBeUndefined();
  });

  it('loads once, restores a stored session, and reuses the instance', async () => {
    const instance = fakeAioha();
    loadRealAioha.mockResolvedValue({ Aioha: function Aioha() { return instance; } });
    localStorage.setItem('aiohaUsername', 'alice');
    localStorage.setItem('aiohaProvider', 'keychain');

    const mod = await import('./aioha');
    expect(mod.hasStoredAiohaSession()).toBe(true);

    const seen: unknown[] = [];
    mod.onAiohaReady((aioha) => seen.push(aioha));

    const first = await mod.ensureAioha();
    const second = await mod.ensureAioha();

    expect(first).toBe(second);
    expect(loadRealAioha).toHaveBeenCalledTimes(1);
    expect(instance.registerKeychain).toHaveBeenCalledTimes(1);
    expect(instance.registerHiveAuth).toHaveBeenCalledTimes(1);
    expect(instance.loadAuth).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([instance]);
    expect(mod.getCurrentUser()).toBe('alice');
    expect(mod.isLoggedIn()).toBe(true);
  });
});
