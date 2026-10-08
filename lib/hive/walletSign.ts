// One wallet signature prompt at a time, shared across duplicated bundles
// (the points client is emitted in more than one chunk, so a module-level
// variable is not a shared lock). A cancel is remembered for a cooldown so
// the next page load does not open Keychain again.

import { isMissingSignBuffer } from '@/lib/hive/injectedWallet';

const HUB_KEY = '__snapieWalletSignHub';
const DECLINE_KEY = 'snapie-sign-declined-until';
const WALLET_COOLDOWN_KEY = 'snapie-wallet-cooldown-until';

export const SIGN_DECLINE_MS = 30 * 60 * 1000;
export const WALLET_COOLDOWN_MS = 15 * 1000;

export class SignDeclinedError extends Error {
  readonly code = 'user_cancel' as const;
  constructor(message = 'Signature request was dismissed') {
    super(message);
    this.name = 'SignDeclinedError';
  }
}

export class WalletMissingError extends Error {
  readonly code = 'wallet_not_injected' as const;
  constructor(message = 'Hive wallet extension is not available yet') {
    super(message);
    this.name = 'WalletMissingError';
  }
}

type Hub = {
  listeners: Set<() => void>;
  idle: Promise<void>;
  current: Promise<unknown> | null;
};

function hub(): Hub {
  const g = globalThis as typeof globalThis & { [HUB_KEY]?: Hub };
  if (!g[HUB_KEY]) {
    g[HUB_KEY] = { listeners: new Set(), idle: Promise.resolve(), current: null };
  }
  return g[HUB_KEY];
}

export function isUserDecline(err: unknown): boolean {
  if (err instanceof SignDeclinedError) return true;
  if (!err || typeof err !== 'object') return false;
  const value = err as { code?: unknown; errorCode?: unknown; message?: unknown };
  if (value.code === 'user_cancel' || value.code === 4001 || value.errorCode === 4001) return true;
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : '';
  return message.includes('cancel') || message.includes('reject') || message.includes('declin') || message.includes('dismiss');
}

export function isSignDeclined(now = Date.now()): boolean {
  try {
    return Number(sessionStorage.getItem(DECLINE_KEY) || 0) > now;
  } catch {
    return false;
  }
}

export function rememberSignDecline(now = Date.now(), ms = SIGN_DECLINE_MS): void {
  try {
    sessionStorage.setItem(DECLINE_KEY, String(now + ms));
  } catch {
    // Private mode: the in-memory hub still stops a second prompt this page.
  }
}

export function clearSignDecline(): void {
  try {
    sessionStorage.removeItem(DECLINE_KEY);
  } catch {
    // ignore
  }
}

export function isWalletCoolingDown(now = Date.now()): boolean {
  try {
    return Number(sessionStorage.getItem(WALLET_COOLDOWN_KEY) || 0) > now;
  } catch {
    return false;
  }
}

export function noteWalletCooldown(now = Date.now(), ms = WALLET_COOLDOWN_MS): void {
  try {
    sessionStorage.setItem(WALLET_COOLDOWN_KEY, String(now + ms));
  } catch {
    // ignore
  }
}

export function onWalletPromptDismiss(listener: () => void): () => void {
  const listeners = hub().listeners;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** User dismissed the Snapie overlay, or an equivalent cancel. */
export function dismissWalletPrompt(): void {
  rememberSignDecline();
  for (const listener of [...hub().listeners]) listener();
}

export function resetWalletSignForTests(): void {
  delete (globalThis as typeof globalThis & { [HUB_KEY]?: Hub })[HUB_KEY];
  clearSignDecline();
  try {
    sessionStorage.removeItem(WALLET_COOLDOWN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Run `prepare` then `sign` with at most one prompt in flight.
 * A second caller joins the in-flight attempt. After a decline, silent
 * callers fail without opening another prompt. The wallet lock is held
 * until `sign` settles, even if the user dismisses the overlay first, so
 * a queued request cannot open a second Keychain popup.
 */
export async function runWalletSign<T>(args: {
  silent?: boolean;
  prepare: () => Promise<'ready' | 'missing'>;
  sign: () => Promise<T>;
}): Promise<T> {
  const gate = hub();
  if (gate.current) return gate.current as Promise<T>;
  if (args.silent && isSignDeclined()) throw new SignDeclinedError();
  if (args.silent && isWalletCoolingDown()) throw new WalletMissingError();

  const attempt = execute(args);
  gate.current = attempt;
  // `.finally()` returns a new promise that rejects again when `attempt`
  // rejects. Swallow that copy so a handled cancel is not an unhandled
  // rejection, while still clearing the join slot.
  void attempt.then(
    () => {
      if (gate.current === attempt) gate.current = null;
    },
    () => {
      if (gate.current === attempt) gate.current = null;
    },
  );
  return attempt;
}

async function execute<T>(args: {
  silent?: boolean;
  prepare: () => Promise<'ready' | 'missing'>;
  sign: () => Promise<T>;
}): Promise<T> {
  const gate = hub();
  await gate.idle;
  if (args.silent && isSignDeclined()) throw new SignDeclinedError();
  if (args.silent && isWalletCoolingDown()) throw new WalletMissingError();

  let released = false;
  let resolveIdle: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    resolveIdle = resolve;
  });
  gate.idle = held;
  const release = () => {
    if (released) return;
    released = true;
    resolveIdle();
    if (gate.idle === held) gate.idle = Promise.resolve();
  };

  let signStarted = false;
  let unsubscribe = () => {};
  const dismissed = new Promise<never>((_, reject) => {
    unsubscribe = onWalletPromptDismiss(() => {
      reject(new SignDeclinedError());
    });
  });
  // Observed even if the race already settled on the wallet result.
  void dismissed.catch(() => {});

  try {
    const ready = await Promise.race([args.prepare(), dismissed]);
    if (ready === 'missing') throw new WalletMissingError();
    signStarted = true;
    // Wrap so a synchronous throw from `sign` still releases the lock.
    const signing = Promise.resolve().then(() => args.sign());
    void signing.finally(release).catch(() => {});
    const value = await Promise.race([signing, dismissed]);
    clearSignDecline();
    return value;
  } catch (err) {
    if (isMissingSignBuffer(err) || err instanceof WalletMissingError) {
      noteWalletCooldown();
      if (err instanceof WalletMissingError) throw err;
      throw new WalletMissingError();
    }
    if (isUserDecline(err)) rememberSignDecline();
    throw err;
  } finally {
    unsubscribe();
    if (!signStarted) release();
  }
}
