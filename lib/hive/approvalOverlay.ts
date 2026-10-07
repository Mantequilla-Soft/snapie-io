// The transaction-approval overlay is not reference-counted by itself.
// Two overlapping wallet requests used to call show/hide independently, so
// a queued request could put the overlay back up after the user dismissed
// the first one. Depth plus a suppress flag keeps a dismiss stuck until
// every in-flight request has finished.

type OverlayState = {
  depth: number;
  suppressed: boolean;
};

const KEY = '__snapieApprovalOverlay';

function state(): OverlayState {
  const g = globalThis as typeof globalThis & { [KEY]?: OverlayState };
  if (!g[KEY]) g[KEY] = { depth: 0, suppressed: false };
  return g[KEY];
}

/** Returns whether this request should show the overlay. */
export function beginApproval(): boolean {
  const overlay = state();
  overlay.depth += 1;
  return !overlay.suppressed;
}

/** Returns whether the overlay should hide (no requests left). */
export function endApproval(): boolean {
  const overlay = state();
  overlay.depth = Math.max(0, overlay.depth - 1);
  if (overlay.depth === 0) {
    overlay.suppressed = false;
    return true;
  }
  return false;
}

/** Hide the overlay and ignore show requests until the current ones finish. */
export function suppressApproval(): void {
  state().suppressed = true;
}

export function resetApprovalOverlayForTests(): void {
  delete (globalThis as typeof globalThis & { [KEY]?: OverlayState })[KEY];
}
