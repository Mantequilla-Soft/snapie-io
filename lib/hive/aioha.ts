'use client';
import type { Aioha } from '@aioha/aioha';
import { Asset, KeyTypes, Providers } from '@/lib/aioha/enums';
import { loadRealAioha } from '@/lib/aioha/load-real';
import { beginApproval, endApproval, suppressApproval } from '@/lib/hive/approvalOverlay';
import { isMissingSignBuffer, waitForInjectedWallet } from '@/lib/hive/injectedWallet';
import { SignDeclinedError, WalletMissingError, dismissWalletPrompt, runWalletSign } from '@/lib/hive/walletSign';
import { fetchHealthyNodes } from './hiveclient';

let aiohaInstance: Aioha | null = null;
let aiohaPending: Promise<Aioha> | null = null;
const readyListeners = new Set<(aioha: Aioha) => void>();

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

// A returning wallet session is these two keys (see Aioha.loadAuth). Checked
// without loading the library so logged-out visitors never download it.
export function hasStoredAiohaSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(localStorage.getItem('aiohaUsername') && localStorage.getItem('aiohaProvider'));
  } catch {
    return false;
  }
}

export function onAiohaReady(cb: (aioha: Aioha) => void): () => void {
  readyListeners.add(cb);
  if (aiohaInstance) cb(aiohaInstance);
  return () => readyListeners.delete(cb);
}

// Wallet providers (Keychain, HiveAuth, PeakVault, Ledger) register here, and
// only after a stored session is restored or a caller actually needs to sign.
// The instance is never created during render, so loadAuth cannot disagree
// with the server HTML.
export function ensureAioha(): Promise<Aioha> {
  if (aiohaInstance) return Promise.resolve(aiohaInstance);
  if (aiohaPending) return aiohaPending;
  aiohaPending = (async () => {
    const { Aioha: AiohaClass } = await loadRealAioha();
    const a = new AiohaClass();
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
      a.setApi('https://api.openhive.network');
      fetchHealthyNodes().then(nodes => { if (nodes.length > 0) a.setApi(nodes[0]) }).catch(() => {});
      try { a.loadAuth(); } catch { /* no stored session, or storage blocked */ }
    }
    aiohaInstance = a;
    aiohaPending = null;
    readyListeners.forEach((cb) => cb(a));
    return a;
  })();
  return aiohaPending;
}

function currentAioha(): Aioha | null {
  return aiohaInstance;
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
  const p = currentAioha()?.getCurrentProvider();
  return (p && PROVIDER_LABEL[p]) || 'your wallet';
}

export function getCurrentProviderHint(): string {
  if (typeof window === 'undefined') return '';
  const p = currentAioha()?.getCurrentProvider();
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
  if (typeof window !== 'undefined') await ensureAioha();
  const label = getCurrentProviderLabel();
  const hint = getCurrentProviderHint();
  const message = `${title} in ${label}…`;
  if (beginApproval() && onWaiting) onWaiting(message, hint);
  try {
    return await op();
  } finally {
    if (endApproval() && onComplete) onComplete();
  }
}

/** Hide the Snapie approval overlay without waiting for the wallet popup. */
export function dismissHiveApproval(): void {
  suppressApproval();
  dismissWalletPrompt();
  if (onComplete) onComplete();
}

// --- Op helpers: every aioha call in the app should go through one of these ---

export async function broadcastOps(
  operations: any[],
  keyType: KeyTypes = KeyTypes.Posting,
  title = 'Approve transaction',
) {
  if (typeof window !== 'undefined') {
    const { isSnapieMode } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      const { broadcastOp } = await import('@/lib/snapie-auth/client');
      // Server only signs posting-key ops, one per request. If every op in
      // this batch is posting-authority, broadcast them all custodially in
      // order; if any isn't (e.g. an active-key op), skip custodial entirely
      // and fall through to Aioha for the whole batch below — same as before.
      const allowed = new Set(['vote', 'comment', 'comment_options', 'delete_comment', 'custom_json', 'claim_reward_balance', 'account_update2']);
      const custodial = operations.every(([opName]) => allowed.has(opName));
      if (custodial) {
        let lastTxId: string | undefined;
        for (const op of operations) {
          const [opName, opBody] = op as [string, Record<string, unknown>];
          const res = await broadcastOp(opName, opBody);
          if ('needsClientSigning' in res) {
            // Every op in this batch is posting-authority (it's in `allowed`
            // above), so a server-side custody gap here always means the
            // account is emancipated and needs a posting-key wallet — never
            // falls through to a local Aioha call with no provider connected,
            // which would otherwise fail silently with no user feedback.
            const { emitNeedsWallet } = await import('@/lib/hive/signing');
            emitNeedsWallet('posting');
            throw Object.assign(new Error('Connect your Hive wallet to finish this action'), { code: 'needs_client_signing' });
          }
          lastTxId = (res as any).txId;
        }
        if (lastTxId) return { success: true as const, result: lastTxId };
      }
    }
  }
  return withTxApproval(async () => {
    const result = await currentAioha()!.signAndBroadcastTx(operations, keyType);
    if (!result.success) throw new Error(result.error || 'Broadcast failed');
    return { success: true as const, result: result.result };
  }, title);
}

export async function voteWithAioha(
  author: string,
  permlink: string,
  weight = 10000,
) {
  if (typeof window !== 'undefined') {
    const { isSnapieMode, getSnapieUsername } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      const { broadcastOp } = await import('@/lib/snapie-auth/client');
      const voter = getSnapieUsername() ?? '';
      const res = await broadcastOp('vote', { voter, author, permlink, weight });
      if ('needsClientSigning' in res) {
        const { emitNeedsWallet } = await import('@/lib/hive/signing');
        emitNeedsWallet('posting');
        throw Object.assign(new Error('Connect your Hive wallet to vote'), { code: 'needs_client_signing' });
      }
      return { success: true as const, result: (res as any).txId };
    }
  }
  return withTxApproval(async () => {
    const result = await currentAioha()!.vote(author, permlink, weight);
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
  if (typeof window !== 'undefined') {
    const { isSnapieMode } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      const { transfer } = await import('@/lib/snapie-auth/client');
      const { emitNeedsWallet } = await import('@/lib/hive/signing');
      const res = await transfer(to, amount, currency, memo);
      if ('needsClientSigning' in res) {
        emitNeedsWallet('active');
        throw Object.assign(new Error('Connect your Hive wallet to complete this transfer'), { code: 'needs_client_signing' });
      }
      if ((res as any).emancipationRequired) window.dispatchEvent(new CustomEvent('snapie:emancipation-required'))
      return { success: true as const, result: (res as any).txId };
    }
  }
  return withTxApproval(async () => {
    const result = await currentAioha()!.transfer(to, amount, currency as any, memo);
    if (!result.success) throw new Error(result.error || 'Transfer failed');
    return { success: true as const, result: result.result };
  }, `Approve transfer of ${amount.toFixed(3)} ${currency}`);
}

// Recurring transfers have no custodial-mode equivalent yet (unlike transfer/
// delegate, the snapie-auth server has no /hive/recurrent-transfer route) —
// Snapie-mode users get a clear "connect a wallet" error instead of silently
// hitting an unsupported path. Callers should check `isSnapieMode()` up front
// to disable the action rather than relying on this throw as the only guard.
export async function recurrentTransferWithAioha(
  to: string,
  amount: number,
  currency: string,
  recurrence: number,
  executions: number,
  memo = '',
) {
  if (typeof window !== 'undefined') {
    const { isSnapieMode } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      throw Object.assign(new Error('Connect your Hive wallet to set up a recurring transfer'), { code: 'needs_client_signing' });
    }
  }
  return withTxApproval(async () => {
    const result = await currentAioha()!.recurrentTransfer(to, amount, currency as any, recurrence, executions, memo);
    if (!result.success) throw new Error(result.error || 'Recurrent transfer failed');
    return { success: true as const, result: result.result };
  }, `Approve recurring transfer of ${amount.toFixed(3)} ${currency}`);
}

export async function transferEncryptedMemoWithAioha(
  to: string,
  amount: number,
  currency: string,
  memo: string,
) {
  const encryptedMemo = memo.startsWith('#') ? memo : `#${memo}`;
  return withTxApproval(async () => {
    const result = await currentAioha()!.transfer(to, amount, currency as any, encryptedMemo);
    if (!result.success) throw new Error(result.error || 'Transfer failed');
    return { success: true as const, result: result.result };
  }, `Approve encrypted memo transfer of ${amount.toFixed(3)} ${currency}`);
}

export async function customJsonWithAioha(
  keyType: KeyTypes,
  id: string,
  json: string,
  displayTitle = '',
  overlayTitle = 'Approve action',
) {
  if (typeof window !== 'undefined') {
    const { isSnapieMode, getSnapieUsername } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      const { broadcastOp } = await import('@/lib/snapie-auth/client');
      const username = getSnapieUsername() ?? '';
      const required_auths = keyType === KeyTypes.Active ? [username] : [];
      const required_posting_auths = keyType === KeyTypes.Posting ? [username] : [];
      const res = await broadcastOp('custom_json', { required_auths, required_posting_auths, id, json });
      if ('needsClientSigning' in res) {
        const { emitNeedsWallet } = await import('@/lib/hive/signing');
        emitNeedsWallet(keyType === KeyTypes.Active ? 'active' : 'posting');
        throw Object.assign(new Error('Connect your Hive wallet to finish this action'), { code: 'needs_client_signing' });
      }
      return { success: true as const, result: (res as any).txId };
    }
  }
  return withTxApproval(async () => {
    const result = await currentAioha()!.customJSON(keyType, id, json, displayTitle);
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
  if (typeof window !== 'undefined') {
    const { isSnapieMode, getSnapieUsername } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      const { broadcastOp } = await import('@/lib/snapie-auth/client');
      const author = getSnapieUsername() ?? '';
      const res = await broadcastOp('comment', {
        parent_author: parentAuthor,
        parent_permlink: parentPermlink,
        author,
        permlink,
        title,
        body,
        json_metadata: jsonMetadata,
      });
      if ('needsClientSigning' in res) {
        const { emitNeedsWallet } = await import('@/lib/hive/signing');
        emitNeedsWallet('posting');
        throw Object.assign(new Error('Connect your Hive wallet to post'), { code: 'needs_client_signing' });
      }
      return { success: true as const, result: (res as any).txId, publicKey: undefined };
    }
  }
  return withTxApproval(async () => {
    const result = await currentAioha()!.comment(
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
  opts: { silent?: boolean } = {},
) {
  // Custodial Snapie Auth users: sign server-side via the proxy.
  if (typeof window !== 'undefined') {
    const { isSnapieMode, emitNeedsWallet } = await import('@/lib/hive/signing');
    if (isSnapieMode()) {
      const { signMessage } = await import('@/lib/snapie-auth/client');
      const res = await signMessage(message);
      if ('needsClientSigning' in res) {
        // The auth backend now signs posting-level challenges with @snapie's
        // own delegated posting key for emancipated users too (mirroring how
        // /broadcast already covers posting ops for them), so this should
        // only fire for active-key requests or an account with no custody
        // mode set at all. This also runs from passive background calls
        // (admin-status checks, opportunistic point awards) that must never
        // interrupt the user — only surface the prompt for callers that
        // opted in as user-initiated (silent defaults to false).
        if (!opts.silent) emitNeedsWallet(keyType === KeyTypes.Active ? 'active' : 'posting');
        throw Object.assign(new Error('Connect your Hive wallet to finish signing in'), { code: 'needs_client_signing' });
      }
      return { success: true as const, result: res.signature };
    }
  }
  return runWalletSign({
    silent: opts.silent,
    prepare: async () => {
      if (typeof window === 'undefined') return 'ready';
      await ensureAioha();
      const provider = currentAioha()?.getCurrentProvider();
      if (provider === Providers.Keychain) {
        return (await waitForInjectedWallet('hive_keychain')) ? 'ready' : 'missing';
      }
      if (provider === Providers.PeakVault) {
        return (await waitForInjectedWallet('peakvault')) ? 'ready' : 'missing';
      }
      return 'ready';
    },
    sign: () => withTxApproval(async () => {
      let result: { success: boolean; result?: string; error?: string; errorCode?: number };
      try {
        result = await currentAioha()!.signMessage(message, keyType);
      } catch (err) {
        if (isMissingSignBuffer(err)) throw new WalletMissingError();
        throw err;
      }
      if (!result.success) {
        if (result.errorCode === 4001 || (result.error && /cancel|reject|declin|dismiss/i.test(result.error))) {
          throw new SignDeclinedError(result.error || 'Signature request was cancelled');
        }
        throw new Error(result.error || 'Sign failed');
      }
      if (!result.result) {
        throw new Error('Sign returned empty result');
      }
      return { success: true as const, result: result.result };
    }, overlayTitle),
  });
}

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return currentAioha()?.isLoggedIn() ?? false;
}

export function getCurrentUser(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return currentAioha()?.getCurrentUser();
}

export { Asset, KeyTypes, Providers };
