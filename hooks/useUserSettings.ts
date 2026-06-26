'use client';
import { useState, useEffect, useCallback } from 'react';

const SETTINGS_KEY = 'snapie_user_settings';

export type PayoutType = 'half_hbd' | 'power_up_100';

export interface UserSettings {
    payoutType: PayoutType;
}

const defaults: UserSettings = {
    payoutType: 'half_hbd',
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

export function useUserSettings() {
    const [settings, setSettings] = useState<UserSettings>(defaults);

    useEffect(() => {
        setSettings(load());
    }, []);

    const update = useCallback((patch: Partial<UserSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...patch };
            try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    // 10000 = 50/50 (half HBD, half HP), 0 = Power Up 100% (all HP)
    const percentHbd = settings.payoutType === 'power_up_100' ? 0 : 10000;

    return { settings, update, percentHbd };
}
