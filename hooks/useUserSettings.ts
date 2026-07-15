'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

const SETTINGS_KEY = 'snapie_user_settings';

export type PayoutType = 'half_hbd' | 'power_up_100';
export type ColorMode = 'dark' | 'light';

export interface UserSettings {
    payoutType: PayoutType;
    colorMode: ColorMode;
    /** Combflow category slugs the user picked in the interest onboarding
     *  modal — the "For You" warm-state signal (see lib/discovery/interestTopics.ts).
     *  Empty until onboarded, or if they picked nothing (Skip). */
    interestTags: string[];
    /** Timestamp the onboarding modal was completed (Save or Skip) — null
     *  means "never shown/finished yet", which is also treated as cold-start
     *  for ranking purposes regardless of interestTags. */
    interestsOnboardedAt: number | null;
    /** id of the newest changelog entry the user has acknowledged (see
     *  lib/changelog.ts + WhatsNewModal). null means "never seen any" — a
     *  brand-new visitor, who gets marked caught-up silently rather than shown
     *  the whole history. */
    lastSeenChangelogId: string | null;
}

const defaults: UserSettings = {
    payoutType: 'half_hbd',
    colorMode: 'dark',
    interestTags: [],
    interestsOnboardedAt: null,
    lastSeenChangelogId: null,
};

function load(): UserSettings {
    if (typeof window === 'undefined') return defaults;
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return defaults;
        return { ...defaults, ...JSON.parse(raw) };
    } catch {
        return defaults;
    }
}

/** Reads the persisted settings synchronously, bypassing the async store
 *  hydration. Use this when you must distinguish a genuinely-absent value from
 *  the store's pre-hydration default (e.g. WhatsNewModal deciding whether a
 *  null lastSeenChangelogId means "brand-new visitor" vs "not loaded yet"). */
export function readUserSettings(): UserSettings {
    return load();
}

// Module-level store shared by every useUserSettings() call in the tree, so
// a change made by one component (e.g. the Settings page) is seen immediately
// by every other consumer (e.g. Providers picking the theme) — without this,
// each component held its own useState copy and only picked up changes on
// the next full page load.
let cached: UserSettings = defaults;
const listeners = new Set<() => void>();

function setCached(next: UserSettings) {
    cached = next;
    listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): UserSettings {
    return cached;
}

function getServerSnapshot(): UserSettings {
    return defaults;
}

export function useUserSettings() {
    const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        setCached(load());
    }, []);

    const update = useCallback((patch: Partial<UserSettings>) => {
        const next = { ...cached, ...patch };
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
        setCached(next);
    }, []);

    // 10000 = 50/50 (half HBD, half HP), 0 = Power Up 100% (all HP)
    const percentHbd = settings.payoutType === 'power_up_100' ? 0 : 10000;

    return { settings, update, percentHbd };
}
