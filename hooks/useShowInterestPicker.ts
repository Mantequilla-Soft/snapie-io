'use client';
import { useEffect, useState } from 'react';
import { isDiscoveryEnabledFor } from '@/lib/discovery/config';

interface InterestsState {
  interestTags: string[];
  interestsOnboardedAt: string | null;
  isNewAccount: boolean;
}

/** Whether the interest-picker onboarding modal should show for this session —
 *  server-authoritative (so it doesn't reappear on a new device/browser, unlike
 *  the old localStorage-only check) and gated to brand-new Hive accounts only.
 *  Defaults to false while loading or on any fetch failure — never show the
 *  prompt due to an infra hiccup. */
export function useShowInterestPicker(username: string | null | undefined): { shouldShow: boolean } {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    setShouldShow(false);
    if (!isDiscoveryEnabledFor(username)) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/user/interests?username=${encodeURIComponent(username!)}`);
        if (!res.ok) return;
        const data = (await res.json()) as InterestsState;
        if (!cancelled) {
          setShouldShow(data.isNewAccount && data.interestsOnboardedAt === null);
        }
      } catch {
        // Fail closed — leave shouldShow false.
      }
    })();

    return () => { cancelled = true; };
  }, [username]);

  return { shouldShow };
}
