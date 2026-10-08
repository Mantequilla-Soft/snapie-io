// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadRealAioha = vi.fn();

vi.mock('@/lib/aioha/load-real', () => ({
  loadRealAioha: () => loadRealAioha(),
}));

vi.mock('./hiveclient', () => ({
  fetchHealthyNodes: vi.fn(async () => []),
}));

function fakeAioha() {
  return {
    registerKeychain: vi.fn(),
    registerLedger: vi.fn(),
    registerPeakVault: vi.fn(),
    registerHiveAuth: vi.fn(),
    registerHiveSigner: vi.fn(),
    setApi: vi.fn(),
    loadAuth: vi.fn(),
    getCurrentUser: () => 'alice',
    getCurrentProvider: () => 'keychain',
    isLoggedIn: () => true,
    signMessage: vi.fn(async () => ({ success: true, result: 'sig' })),
    on: vi.fn(),
    off: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetModules();
  loadRealAioha.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  delete (window as unknown as { hive_keychain?: unknown }).hive_keychain;
  delete (globalThis as { __snapieWalletSignHub?: unknown }).__snapieWalletSignHub;
  delete (globalThis as { __snapieApprovalOverlay?: unknown }).__snapieApprovalOverlay;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('signMessageWithAioha without Keychain', () => {
  it('does not throw requestSignBuffer when the extension is missing', async () => {
    const instance = fakeAioha();
    loadRealAioha.mockResolvedValue({ Aioha: function Aioha() { return instance; } });
    const { signMessageWithAioha, KeyTypes } = await import('./aioha');

    await expect(
      signMessageWithAioha('challenge', KeyTypes.Posting, 'Enable Snapie Points', { silent: true }),
    ).rejects.toMatchObject({ code: 'wallet_not_injected' });
    expect(instance.signMessage).not.toHaveBeenCalled();
  }, 10000);

  it('signs once Keychain has injected', async () => {
    const instance = fakeAioha();
    loadRealAioha.mockResolvedValue({ Aioha: function Aioha() { return instance; } });
    (window as unknown as { hive_keychain?: { requestSignBuffer: () => void } }).hive_keychain = {
      requestSignBuffer: () => {},
    };
    const { signMessageWithAioha, KeyTypes } = await import('./aioha');
    const signed = await signMessageWithAioha('challenge', KeyTypes.Posting, 'Enable Snapie Points');
    expect(signed.result).toBe('sig');
    expect(instance.signMessage).toHaveBeenCalledTimes(1);
  });

  it('joins a second sign onto the in-flight prompt', async () => {
    const instance = fakeAioha();
    let release: (value: { success: boolean; result: string }) => void = () => {};
    instance.signMessage.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));
    loadRealAioha.mockResolvedValue({ Aioha: function Aioha() { return instance; } });
    (window as unknown as { hive_keychain?: { requestSignBuffer: () => void } }).hive_keychain = {
      requestSignBuffer: () => {},
    };
    const { signMessageWithAioha, KeyTypes } = await import('./aioha');
    const first = signMessageWithAioha('challenge', KeyTypes.Posting);
    const second = signMessageWithAioha('challenge', KeyTypes.Posting);
    await vi.waitFor(() => expect(instance.signMessage).toHaveBeenCalledTimes(1));
    release({ success: true, result: 'sig' });
    await expect(first).resolves.toMatchObject({ result: 'sig' });
    await expect(second).resolves.toMatchObject({ result: 'sig' });
    expect(instance.signMessage).toHaveBeenCalledTimes(1);
  });
});
