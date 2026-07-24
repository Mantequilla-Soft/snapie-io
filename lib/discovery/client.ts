'use client';
import { ensureSessionToken } from '@/lib/points/client';

/** Persists that the interest-picker onboarding prompt was completed (saved or
 *  skipped), so it doesn't reappear on another device/browser. Fire-and-forget:
 *  a failed save just means the prompt might show once more elsewhere later,
 *  not worth surfacing an error for. */
export function saveInterestsOnboarding(username: string, interestTags: string[]): void {
  if (typeof window === 'undefined') return;

  void (async () => {
    try {
      const token = await ensureSessionToken(username);
      if (!token) return; // e.g. user declined the signature prompt — skip silently

      await fetch('/api/user/interests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ interestTags }),
      });
    } catch {
      // Swallow — see docblock above.
    }
  })();
}
