import { useCallback, useEffect, useState, type RefObject } from 'react';

// The Screen Orientation API's lock() method is well-supported on Android
// Chrome/Firefox but isn't in TS's DOM lib (still non-standard) and is not
// implemented at all by iOS Safari — treat it as optional and fail silently,
// same convention as useWakeLock.
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
  unlock?: () => void;
};

/**
 * Fullscreen toggle for a target element, with a best-effort landscape lock
 * on entry. Orientation lock only works while fullscreen, and only on
 * browsers that implement it (Android) — where it's unsupported (iOS Safari
 * never implemented it) this silently no-ops and the device stays in
 * whatever orientation the user is holding it, so callers should pair this
 * with a "rotate your device" hint driven by an orientation media query.
 */
export function useFullscreen(targetRef: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof document !== 'undefined' && document.fullscreenEnabled === true);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [targetRef]);

  const enter = useCallback(async () => {
    const el = targetRef.current;
    if (!el) return;
    try {
      await el.requestFullscreen();
      const orientation = screen.orientation as LockableOrientation | undefined;
      await orientation?.lock?.('landscape').catch(() => {});
    } catch {
      // Rejected (not a user gesture, disallowed by permissions policy, etc.) — ignore.
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    if (document.fullscreenElement) {
      const orientation = screen.orientation as LockableOrientation | undefined;
      orientation?.unlock?.();
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement === targetRef.current) exit();
    else enter();
  }, [enter, exit, targetRef]);

  return { isFullscreen, supported, toggle };
}

/** True while the viewport is portrait — pair with isFullscreen to show a
 *  "rotate your device" hint when landscape lock silently failed (iOS). */
export function usePortraitOrientation() {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    setIsPortrait(mq.matches);
    const onChange = () => setIsPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isPortrait;
}
