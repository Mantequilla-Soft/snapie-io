'use client';

import { useEffect, useState, startTransition } from 'react';

const WAIT_MS = 2500;

/**
 * Resolves when the home priority image has loaded, or immediately when the
 * document has none. Callers use this to start non-critical chunks after the
 * LCP photo instead of during its download. Framework-script deferral
 * (SNAPIE_DEFER_FRAMEWORK_SCRIPTS) is a separate switch and stays off.
 */
export function afterPriorityImage(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const img = document.querySelector('img[fetchpriority="high"]');
  if (!(img instanceof HTMLImageElement) || img.complete) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, WAIT_MS);
  });
}

/**
 * Runs `start` immediately when nothing with fetchpriority=high is still
 * loading, and after that image otherwise. Pages without a priority photo
 * keep their current timing. Returns a cancel function.
 */
export function scheduleAfterPriorityImage(start: () => void): () => void {
  if (typeof document === 'undefined') {
    start();
    return () => undefined;
  }
  const img = document.querySelector('img[fetchpriority="high"]');
  if (!(img instanceof HTMLImageElement) || img.complete) {
    start();
    return () => undefined;
  }
  let cancel = false;
  afterPriorityImage().then(() => {
    if (!cancel) start();
  });
  return () => {
    cancel = true;
  };
}

/** True after the priority image has loaded. Starts false so the first
 *  paint does not also run feed observers and polls. The flip is a
 *  transition, so that later render can yield instead of one long task. */
export function useAfterPriorityImage(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancel = false;
    afterPriorityImage().then(() => {
      if (cancel) return;
      startTransition(() => setReady(true));
    });
    return () => {
      cancel = true;
    };
  }, []);
  return ready;
}
