const LCP_WAIT_MS = 2500;

/**
 * Resolves once a largest-contentful-paint entry exists, or after 2.5s.
 * No-ops when the document has no high-priority image: other pages should
 * not wait. The home feed uses this so the dhive download starts after the
 * LCP image has painted instead of competing with it.
 */
export function afterLcpPaint(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const img = document.querySelector('img[fetchpriority="high"]');
  if (!img) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    try {
      if (performance.getEntriesByType("largest-contentful-paint").length > 0) {
        finish();
        return;
      }
      const observer = new PerformanceObserver((list) => {
        if (list.getEntries().length === 0) return;
        observer.disconnect();
        finish();
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      finish();
      return;
    }

    window.setTimeout(finish, LCP_WAIT_MS);
  });
}
