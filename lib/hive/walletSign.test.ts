// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SignDeclinedError,
  WalletMissingError,
  dismissWalletPrompt,
  isSignDeclined,
  resetWalletSignForTests,
  runWalletSign,
} from './walletSign';

afterEach(() => {
  resetWalletSignForTests();
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (err: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('runWalletSign', () => {
  it('runs one in-flight sign when two callers start together', async () => {
    const sign = deferred<{ ok: true }>();
    let calls = 0;
    const start = () => runWalletSign({
      silent: true,
      prepare: async () => 'ready' as const,
      sign: () => {
        calls += 1;
        return sign.promise;
      },
    });

    const first = start();
    const second = start();
    sign.resolve({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
    expect(calls).toBe(1);
  });

  it('does not open another prompt after a cancel', async () => {
    const sign = deferred<string>();
    let calls = 0;
    const first = runWalletSign({
      silent: true,
      prepare: async () => 'ready' as const,
      sign: () => {
        calls += 1;
        return sign.promise;
      },
    });
    await vi.waitFor(() => expect(calls).toBe(1));
    dismissWalletPrompt();
    await expect(first).rejects.toBeInstanceOf(SignDeclinedError);
    expect(isSignDeclined()).toBe(true);

    await expect(runWalletSign({
      silent: true,
      prepare: async () => 'ready' as const,
      sign: async () => {
        calls += 1;
        return 'nope';
      },
    })).rejects.toBeInstanceOf(SignDeclinedError);
    expect(calls).toBe(1);

    sign.resolve('late');
    await sign.promise;
  });

  it('holds the wallet lock until the first popup settles, so a second sign cannot queue', async () => {
    const sign = deferred<string>();
    let calls = 0;
    const first = runWalletSign({
      prepare: async () => 'ready' as const,
      sign: () => {
        calls += 1;
        return sign.promise;
      },
    });
    await vi.waitFor(() => expect(calls).toBe(1));
    dismissWalletPrompt();
    await expect(first).rejects.toBeInstanceOf(SignDeclinedError);

    let secondStarted = false;
    const second = runWalletSign({
      prepare: async () => 'ready' as const,
      sign: () => {
        secondStarted = true;
        calls += 1;
        return Promise.resolve('second');
      },
    });
    await Promise.resolve();
    expect(secondStarted).toBe(false);

    sign.resolve('first');
    await expect(second).resolves.toBe('second');
    expect(calls).toBe(2);
  });

  it('fails closed when the extension is missing and does not call sign', async () => {
    let calls = 0;
    await expect(runWalletSign({
      silent: true,
      prepare: async () => 'missing' as const,
      sign: async () => {
        calls += 1;
        return 'signed';
      },
    })).rejects.toBeInstanceOf(WalletMissingError);
    expect(calls).toBe(0);

    await expect(runWalletSign({
      silent: true,
      prepare: async () => 'ready' as const,
      sign: async () => {
        calls += 1;
        return 'signed';
      },
    })).rejects.toBeInstanceOf(WalletMissingError);
    expect(calls).toBe(0);
  });
});
