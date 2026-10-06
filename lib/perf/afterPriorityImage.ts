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
