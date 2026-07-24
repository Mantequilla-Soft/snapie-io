'use client';
import { isPointsEnabledFor } from '@/lib/points/config';
import { PointsActionType } from '@/lib/points/constants';
import { chatService } from '@/lib/chat/ChatService';
import { signMessageWithAioha, KeyTypes } from '@/lib/hive/aioha';

// Same session token the chat API uses — it's a general Hive-verified session
// token, not chat-specific (minted by the signed-challenge login).
const SESSION_TOKEN_KEY = 'hive-chat-token';

export const POINTS_EARNED_EVENT = 'snapie:points-earned';

export interface PointsEarnedDetail {
  awarded: number;
  balance: number;
}

// Guards against firing two parallel authenticate() calls (and, for wallet
// users, two stacked signature prompts) if two point-earning actions happen
// in quick succession before the first mint finishes. Keyed by username so a
// user switch doesn't reuse a stale in-flight promise for the wrong account.
let tokenMintInFlight: { username: string; promise: Promise<string | null> } | null = null;

/** Returns a usable session token, minting one via the same signed-challenge
 *  flow ChatPanel uses if the user doesn't already have one — previously,
 *  awardPoints() silently gave up here, so anyone who'd never opened Chat
 *  never earned a single point no matter what they did. Custodial (Snapie
 *  auth) users sign silently server-side; wallet users see one Keychain-style
 *  approval prompt, same as opening Chat for the first time would ask for. */
export async function ensureSessionToken(username: string): Promise<string | null> {
  const existing = localStorage.getItem(SESSION_TOKEN_KEY);
  if (existing) return existing;

  if (tokenMintInFlight?.username === username) return tokenMintInFlight.promise;

  const promise = (async () => {
    try {
      await chatService.authenticate(username, async challenge => {
        const res = await signMessageWithAioha(challenge, KeyTypes.Posting, 'Enable Snapie Points');
        if (!res.success || !res.result) throw new Error('Sign failed');
        return res.result as string;
      });
      return localStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    } finally {
      tokenMintInFlight = null;
    }
  })();

  tokenMintInFlight = { username, promise };
  return promise;
}

/** Fire-and-forget award report. Points must NEVER disrupt the underlying user
 *  action, so this is gated, non-blocking, and swallows every error. On a real
 *  award it dispatches POINTS_EARNED_EVENT so the toaster + any balance display
 *  can react.
 *
 *  `target*` identifies what the action was about: for content actions that's
 *  the user's own new post; for vote/reblog it's the post they acted on. */
export function awardPoints(
  actionType: PointsActionType,
  username: string | null | undefined,
  targetAuthor: string,
  targetPermlink: string,
): void {
  if (typeof window === 'undefined') return;
  if (!isPointsEnabledFor(username)) return;

  void (async () => {
    try {
      const token = await ensureSessionToken(username!);
      if (!token) return; // e.g. user declined the signature prompt — skip silently

      const res = await fetch('/api/points/award', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, author: targetAuthor, permlink: targetPermlink }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { status?: string; awarded?: number; balance?: number };
      if (data?.status === 'awarded' && (data.awarded ?? 0) > 0) {
        window.dispatchEvent(
          new CustomEvent<PointsEarnedDetail>(POINTS_EARNED_EVENT, {
            detail: { awarded: data.awarded!, balance: data.balance ?? 0 },
          }),
        );
      }
    } catch {
      // Swallow — nothing about points should ever surface to the user.
    }
  })();
}

export interface PurchaseVerifyResult {
  status: 'credited' | 'duplicate' | 'unverified' | 'out_of_range';
  pointsCredited: number;
  balance: number;
}

/** Verifies a just-broadcast HBD transfer and credits points for it. Unlike
 *  awardPoints(), this is NOT fire-and-forget — the user just spent real
 *  money and is actively waiting on this screen, so errors must surface
 *  rather than swallow silently.
 *
 *  Also owns the pending-purchase lifecycle (see recordPendingPurchase
 *  below): any terminal result (anything but 'unverified') clears it, so
 *  both a normal in-page verify and a resumePendingPurchase() call after a
 *  restart share the exact same clearing logic — no duplication, no risk of
 *  one path forgetting to clean up. */
export async function verifyPointsPurchase(username: string, txid: string): Promise<PurchaseVerifyResult> {
  const token = await ensureSessionToken(username);
  if (!token) throw new Error('Could not start a session to verify this purchase. Please try again.');

  const res = await fetch('/api/points/purchase/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ txid }),
  });
  if (!res.ok) throw new Error('Could not verify this purchase. Please try again.');

  const data = (await res.json()) as PurchaseVerifyResult;
  if (data.status !== 'unverified') clearPendingPurchase();
  if (data.status === 'credited' && data.pointsCredited > 0) {
    window.dispatchEvent(
      new CustomEvent<PointsEarnedDetail>(POINTS_EARNED_EVENT, {
        detail: { awarded: data.pointsCredited, balance: data.balance },
      }),
    );
  }
  return data;
}

// --- Pending-purchase persistence -------------------------------------
//
// A Buy Points broadcast can succeed on-chain (real HBD moved) and then
// never reach verifyPointsPurchase() — tab closed, phone locked, network
// dropped — leaving the user with no points and no record the app can act
// on. Persisting the txid the moment the broadcast succeeds, before
// verification is even attempted, means the next time this user loads the
// Buy Points page we can resume and finish the job automatically.

const PENDING_PURCHASE_KEY = 'snapie-pending-points-purchase';
const MAX_AUTO_RETRY_ATTEMPTS = 3;
const PENDING_PURCHASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingPurchase {
  txid: string;
  username: string;
  createdAt: number;
  attempts: number;
}

function readPendingPurchase(): PendingPurchase | null {
  try {
    const raw = localStorage.getItem(PENDING_PURCHASE_KEY);
    return raw ? (JSON.parse(raw) as PendingPurchase) : null;
  } catch {
    return null;
  }
}

function writePendingPurchase(pending: PendingPurchase | null): void {
  try {
    if (pending) localStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_PURCHASE_KEY);
  } catch {
    // Storage unavailable (private mode, quota) — the resume feature just
    // won't work this session, nothing else about the purchase depends on it.
  }
}

/** Call immediately after a Buy Points transfer broadcasts successfully,
 *  before calling verifyPointsPurchase() — so a crash during verification
 *  itself still leaves a record to resume from. */
export function recordPendingPurchase(username: string, txid: string): void {
  writePendingPurchase({ txid, username, createdAt: Date.now(), attempts: 0 });
}

export function clearPendingPurchase(): void {
  writePendingPurchase(null);
}

/** Returns the txid of an unresolved purchase for this user, if any —
 *  for surfacing "we're still trying to confirm a purchase" in the UI. */
export function getPendingPurchaseTxid(username: string): string | null {
  const pending = readPendingPurchase();
  return pending && pending.username === username ? pending.txid : null;
}

/** Resumes a purchase left pending by a previous page load, if one exists
 *  for this user. Bounded to a few auto-retries and 24h so a genuinely dead
 *  transfer doesn't hammer the verify endpoint forever — after that it's
 *  left in place (still readable via getPendingPurchaseTxid) for the user to
 *  copy into a support request, matching the existing 'unverified' error
 *  copy. Returns null if there was nothing to resume or it wasn't attempted. */
export async function resumePendingPurchase(username: string): Promise<PurchaseVerifyResult | null> {
  const pending = readPendingPurchase();
  if (!pending || pending.username !== username) return null;

  if (Date.now() - pending.createdAt > PENDING_PURCHASE_MAX_AGE_MS) {
    clearPendingPurchase();
    return null;
  }
  if (pending.attempts >= MAX_AUTO_RETRY_ATTEMPTS) return null;

  writePendingPurchase({ ...pending, attempts: pending.attempts + 1 });

  try {
    return await verifyPointsPurchase(username, pending.txid);
  } catch {
    return null; // leave it pending — network hiccup on the resume attempt itself
  }
}
