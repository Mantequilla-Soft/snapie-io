const LCP_WAIT_MS = 2500;

/**
 * Resolves once the high-priority image has loaded, or after 2.5s.
 * No-ops when the document has no high-priority image: other pages should
 * not wait. A text LCP entry is not enough. On home that entry can be the
 * author line, and treating it as "the image painted" starts the dhive
 * chunk and sidebar fetches while the photo is still downloading.
 */
export function afterLcpPaint(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const img = document.querySelector('img[fetchpriority="high"]');
  if (!(img instanceof HTMLImageElement) || img.complete) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", finish, { once: true });
    window.setTimeout(finish, LCP_WAIT_MS);
  });
}
