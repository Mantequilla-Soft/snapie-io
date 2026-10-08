// Hive Keychain (and PeakVault) inject their page API after the document
// starts. Calling `window.hive_keychain.requestSignBuffer` before that
// injection throws `TypeError: Cannot read properties of undefined (reading
// 'requestSignBuffer')`. Wait for the object, and report a miss instead of
// letting that TypeError escape.

export type InjectedWalletName = 'hive_keychain' | 'peakvault';

const INJECT_EVENT = 'hive_keychain_injection';

export function readInjectedWallet(name: InjectedWalletName): unknown | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as Record<string, unknown>)[name];
  return value == null ? null : value;
}

export function isMissingSignBuffer(err: unknown): boolean {
  return err instanceof TypeError && typeof err.message === 'string' && err.message.includes('requestSignBuffer');
}

/**
 * Resolve true once the extension API is on `window`, or false when
 * `timeoutMs` elapses. Never throws if the global is missing.
 */
export function waitForInjectedWallet(name: InjectedWalletName, timeoutMs = 2000): Promise<boolean> {
  if (readInjectedWallet(name)) return Promise.resolve(true);
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      window.removeEventListener(INJECT_EVENT, onInject);
      resolve(ready);
    };
    const onInject = () => {
      if (readInjectedWallet(name)) finish(true);
    };
    window.addEventListener(INJECT_EVENT, onInject);
    const poll = window.setInterval(() => {
      if (readInjectedWallet(name)) finish(true);
    }, 50);
    const timer = window.setTimeout(() => finish(!!readInjectedWallet(name)), timeoutMs);
  });
}
