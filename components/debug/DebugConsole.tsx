'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'snapie_debug_console';

/**
 * Temporary, opt-in on-page debug console (Eruda) for troubleshooting bugs
 * that only reproduce on a phone, without needing USB/remote debugging.
 *
 * Visit any page once with ?debug=1 to turn it on for this device — it then
 * persists via localStorage across navigation and reloads until visited
 * again with ?debug=0. Nobody else is affected; nothing loads unless this
 * flag is set. Remove this component (and its import in LayoutContent) once
 * the mobile video-upload investigation is done — it's a diagnostic aid,
 * not a permanent feature.
 */
export default function DebugConsole() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const param = searchParams.get('debug');
        if (param === '1') localStorage.setItem(STORAGE_KEY, '1');
        if (param === '0') localStorage.removeItem(STORAGE_KEY);

        const enabled = param === '1' || localStorage.getItem(STORAGE_KEY) === '1';
        if (!enabled) return;
        if ((window as any).eruda) return;

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/eruda';
        script.onload = () => (window as any).eruda?.init();
        document.body.appendChild(script);
    }, [searchParams]);

    return null;
}
