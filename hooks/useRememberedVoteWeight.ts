'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserSettings } from './useUserSettings';

/**
 * A vote-weight slider's value, seeded from the last weight the user voted
 * with anywhere in the app (see UserSettings.lastVoteWeight), falling back
 * to `fallbackWeight` if they've never voted. Call `rememberWeight` after a
 * successful vote to update it for next time.
 *
 * useUserSettings starts from its module-level defaults (lastVoteWeight:
 * null) until its own mount effect reads localStorage — by then this hook's
 * own useState initializer has already locked in the fallback, so a
 * one-time sync-after-hydration effect (guarded to fire only once, not on
 * every later change — a vote cast elsewhere while a slider is sitting open
 * shouldn't yank it mid-drag) catches the real remembered value once it's
 * actually available.
 */
export function useRememberedVoteWeight(fallbackWeight: number) {
    const { settings, update } = useUserSettings();
    const [weight, setWeight] = useState(settings.lastVoteWeight ?? fallbackWeight);
    const syncedRef = useRef(false);

    useEffect(() => {
        if (!syncedRef.current && settings.lastVoteWeight != null) {
            setWeight(settings.lastVoteWeight);
            syncedRef.current = true;
        }
    }, [settings.lastVoteWeight]);

    const rememberWeight = useCallback((finalWeight: number) => {
        update({ lastVoteWeight: finalWeight });
    }, [update]);

    return { weight, setWeight, rememberWeight };
}
