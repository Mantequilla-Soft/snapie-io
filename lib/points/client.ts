'use client';
import { isPointsEnabledFor } from '@/lib/points/config';
import { PointsActionType } from '@/lib/points/constants';

// Same session token the chat API uses — it's a general Hive-verified session
// token, not chat-specific (minted by the signed-challenge login).
const SESSION_TOKEN_KEY = 'hive-chat-token';

export const POINTS_EARNED_EVENT = 'snapie:points-earned';

export interface PointsEarnedDetail {
  awarded: number;
  balance: number;
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
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) return; // not authenticated to the session API yet — skip silently

  void (async () => {
    try {
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
