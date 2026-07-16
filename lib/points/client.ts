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
async function ensureSessionToken(username: string): Promise<string | null> {
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
