type Handler = () => void | Promise<void>;

/**
 * Manages a single setInterval that fans out to multiple subscribers.
 * Starting the first subscription starts the timer; removing the last stops it.
 */
export class PollingManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private handlers: Set<Handler> = new Set();
  private interval: number;

  constructor(intervalMs: number) {
    this.interval = intervalMs;
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), this.interval);
    }
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private tick() {
    for (const h of this.handlers) {
      try { h(); } catch { /* individual handler errors don't break others */ }
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.handlers.clear();
  }
}
