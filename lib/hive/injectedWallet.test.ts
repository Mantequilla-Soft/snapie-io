// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMissingSignBuffer, readInjectedWallet, waitForInjectedWallet } from './injectedWallet';

afterEach(() => {
  delete (window as unknown as { hive_keychain?: unknown }).hive_keychain;
  delete (window as unknown as { peakvault?: unknown }).peakvault;
  vi.useRealTimers();
});

describe('injected wallet', () => {
  it('reads nothing until the extension injects', () => {
    expect(readInjectedWallet('hive_keychain')).toBeNull();
    (window as unknown as { hive_keychain?: { requestSignBuffer: () => void } }).hive_keychain = {
      requestSignBuffer: () => {},
    };
    expect(readInjectedWallet('hive_keychain')).toBeTruthy();
  });

  it('resolves when hive_keychain appears before the timeout', async () => {
    vi.useFakeTimers();
    const pending = waitForInjectedWallet('hive_keychain', 2000);
    setTimeout(() => {
      (window as unknown as { hive_keychain?: { ok: boolean } }).hive_keychain = { ok: true };
    }, 100);
    // The 50ms poll can run at the same timestamp as the injection timer
    // and miss it. Advance one more poll so the waiter observes the global.
    await vi.advanceTimersByTimeAsync(150);
    await expect(pending).resolves.toBe(true);
  });

  it('resolves on the keychain injection event', async () => {
    const pending = waitForInjectedWallet('hive_keychain', 2000);
    (window as unknown as { hive_keychain?: { ok: boolean } }).hive_keychain = { ok: true };
    window.dispatchEvent(new Event('hive_keychain_injection'));
    await expect(pending).resolves.toBe(true);
  });

  it('returns false when the extension never arrives, without throwing', async () => {
    vi.useFakeTimers();
    const pending = waitForInjectedWallet('hive_keychain', 2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe(false);
  });

  it('recognises the requestSignBuffer TypeError', () => {
    expect(isMissingSignBuffer(new TypeError("Cannot read properties of undefined (reading 'requestSignBuffer')"))).toBe(true);
    expect(isMissingSignBuffer(new Error('Sign failed'))).toBe(false);
  });
});
