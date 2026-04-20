'use client';
import { Aioha, Asset, KeyTypes, Providers } from '@aioha/aioha';

let aiohaInstance: Aioha | null = null;

// HiveSigner only registers when the env var opts in. Default: off until the
// app/callback URL are configured and we want it in the provider list.
const HIVESIGNER_ENABLED = process.env.NEXT_PUBLIC_HIVESIGNER_ENABLED === 'true';

// Providers we want to *always* show as icons in the login modal, even if the
// corresponding extension/device isn't detected. AiohaModal's forceShowProviders
// prop passes these through to ProviderSelection so they render regardless of
// `isProviderEnabled`.
export function getLoginProviders(): Providers[] {
  const base = [Providers.Keychain, Providers.PeakVault, Providers.HiveAuth, Providers.Ledger];
  return HIVESIGNER_ENABLED ? [...base, Providers.HiveSigner] : base;
}

// Build Aioha manually so the instance is safe to create during SSR:
// provider registration (Keychain, HiveAuth, HiveSigner) only runs client-side
// where `window` is defined. This lets AiohaProvider always wrap the tree.
export function getAioha(): Aioha {
  if (aiohaInstance) return aiohaInstance;
  const a = new Aioha();
  if (typeof window !== 'undefined') {
    a.registerKeychain();
    a.registerLedger();
    a.registerPeakVault();
    a.registerHiveAuth({
      name: 'Snapie',
      description: 'Snapie - Hive community frontend',
    });
    if (HIVESIGNER_ENABLED) {
      a.registerHiveSigner({
        app: 'snapie.io',
        callbackURL: window.location.origin + '/hivesigner.html',
        scope: ['login', 'vote', 'comment', 'follow', 'transfer'],
      });
    }
    a.setApi('https://api.hive.blog');
    // NOTE: loadAuth() is intentionally NOT called here. It reads localStorage
    // synchronously and would populate `user` before hydration, causing a
    // server/client mismatch. The Providers component calls loadAuth() inside
    // a post-mount useEffect instead.
  }
  aiohaInstance = a;
  return a;
}

// Human-readable names for the spinner overlay.
const PROVIDER_LABEL: Partial<Record<Providers, string>> = {
  [Providers.Keychain]: 'Hive Keychain',
  [Providers.HiveAuth]: 'HiveAuth',
  [Providers.HiveSigner]: 'HiveSigner',
  [Providers.PeakVault]: 'PeakVault',
  [Providers.Ledger]: 'Ledger',
};

// Hint shown under the main line so users know where to look.
const PROVIDER_HINT: Partial<Record<Providers, string>> = {
  [Providers.Keychain]: 'Open the Keychain extension popup to approve.',
  [Providers.HiveAuth]: 'Check your HiveAuth mobile app to approve this transaction.',
  [Providers.HiveSigner]: 'A HiveSigner window should open — sign in there.',
  [Providers.PeakVault]: 'Open the PeakVault extension popup to approve.',
  [Providers.Ledger]: 'Confirm the transaction on your Ledger device.',
};

export function getCurrentProviderLabel(): string {
  if (typeof window === 'undefined') return 'your wallet';
  const p = getAioha().getCurrentProvider();
  return (p && PROVIDER_LABEL[p]) || 'your wallet';
}

export function getCurrentProviderHint(): string {
  if (typeof window === 'undefined') return '';
  const p = getAioha().getCurrentProvider();
  return (p && PROVIDER_HINT[p]) || '';
}

// Overlay callback registration (set from HiveAuthProvider on mount).
type WaitingCb = ((message: string, hint?: string) => void) | null;
let onWaiting: WaitingCb = null;
let onComplete: (() => void) | null = null;

export function setHiveAuthCallbacks(
  waiting: WaitingCb,
  complete: (() => void) | null,
) {
  onWaiting = waiting;
  onComplete = complete;
}

/**
 * Wrap an aioha operation with the transaction-approval overlay.
 *
 * Unlike the original 3speak version, this fires for EVERY provider — not
 * just HiveAuth — so the user always sees what we're waiting on. The message
 * is tailored to the current provider.
 */
export async function withTxApproval<T>(
  op: () => Promise<T>,
  title = 'Waiting for approval',
): Promise<T> {
  const label = getCurrentProviderLabel();
  const hint = getCurrentProviderHint();
  const message = `${title} in ${label}…`;
  if (onWaiting) onWaiting(message, hint);
  try {
    return await op();
  } finally {
    if (onComplete) onComplete();
  }
}

// --- Op helpers: every aioha call in the app should go through one of these ---

export async function broadcastOps(
  operations: any[],
  keyType: KeyTypes = KeyTypes.Posting,
  title = 'Approve transaction',
) {
  return withTxApproval(async () => {
    const result = await getAioha().signAndBroadcastTx(operations, keyType);
    if (!result.success) throw new Error(result.error || 'Broadcast failed');
    return { success: true as const, result: result.result };
  }, title);
}

export async function voteWithAioha(
  author: string,
  permlink: string,
  weight = 10000,
) {
  return withTxApproval(async () => {
    const result = await getAioha().vote(author, permlink, weight);
    if (!result.success) throw new Error(result.error || 'Vote failed');
    return { success: true as const, result: result.result };
  }, weight >= 0 ? 'Approve vote' : 'Approve downvote');
}

export async function transferWithAioha(
  to: string,
  amount: number,
  currency: string,
  memo = '',
) {
  return withTxApproval(async () => {
    const result = await getAioha().transfer(to, amount, currency as any, memo);
    if (!result.success) throw new Error(result.error || 'Transfer failed');
    return { success: true as const, result: result.result };
  }, `Approve transfer of ${amount.toFixed(3)} ${currency}`);
}

export async function customJsonWithAioha(
  keyType: KeyTypes,
  id: string,
  json: string,
  displayTitle = '',
  overlayTitle = 'Approve action',
) {
  return withTxApproval(async () => {
    const result = await getAioha().customJSON(keyType, id, json, displayTitle);
    if (!result.success) throw new Error(result.error || 'Custom JSON failed');
    return { success: true as const, result: result.result };
  }, overlayTitle);
}

export async function commentWithAioha(
  parentAuthor: string,
  parentPermlink: string,
  permlink: string,
  title: string,
  body: string,
  jsonMetadata: string,
  options?: any,
  overlayTitle = 'Approve post',
) {
  return withTxApproval(async () => {
    const result = await getAioha().comment(
      parentAuthor,
      parentPermlink,
      permlink,
      title,
      body,
      jsonMetadata,
      options,
    );
    if (!result.success) throw new Error(result.error || 'Comment failed');
    return { success: true as const, result: result.result, publicKey: (result as any).publicKey };
  }, overlayTitle);
}

export async function signMessageWithAioha(
  message: string,
  keyType: KeyTypes = KeyTypes.Posting,
  overlayTitle = 'Approve signature request',
) {
  return withTxApproval(async () => {
    const result = await getAioha().signMessage(message, keyType);
    if (!result.success) {
      throw new Error(result.error || 'Sign failed');
    }
    if (!result.result) {
      throw new Error('Sign returned empty result');
    }
    return { success: true as const, result: result.result as string };
  }, overlayTitle);
}

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return getAioha().isLoggedIn();
}

export function getCurrentUser(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return getAioha().getCurrentUser();
}

export { Asset, KeyTypes, Providers };
