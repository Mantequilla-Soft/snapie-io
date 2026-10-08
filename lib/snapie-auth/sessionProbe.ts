import type { SnapieMeUser } from '@/lib/snapie-auth/types';

// GET /auth/me is limited with every other /api/auth call (30 per 15 minutes
// on the auth service). A Keychain session is not a Snapie Auth cookie, so
// the probe is a 401. Remember that, and back off on 429, so a browse does
// not call it again on every page.

const HUB_KEY = '__snapieAuthProbe';
const SKIP_KEY = 'snapie-auth-me-skip-until';

const ANON_SKIP_MS = 30 * 60 * 1000;
const RATE_LIMIT_SKIP_MS = 15 * 60 * 1000;

type Hub = {
  inflight: Promise<SnapieMeUser | null> | null;
  settled: boolean;
  user: SnapieMeUser | null;
};

function hub(): Hub {
  const g = globalThis as typeof globalThis & { [HUB_KEY]?: Hub };
  if (!g[HUB_KEY]) g[HUB_KEY] = { inflight: null, settled: false, user: null };
  return g[HUB_KEY];
}

export function shouldSkipAuthMe(now = Date.now()): boolean {
  try {
    return Number(sessionStorage.getItem(SKIP_KEY) || 0) > now;
  } catch {
    return false;
  }
}

export function noteAuthMeFailure(status: number, now = Date.now()): void {
  const ms = status === 429 ? RATE_LIMIT_SKIP_MS : ANON_SKIP_MS;
  try {
    sessionStorage.setItem(SKIP_KEY, String(now + ms));
  } catch {
    // ignore
  }
}

export function clearAuthMeSkip(): void {
  try {
    sessionStorage.removeItem(SKIP_KEY);
  } catch {
    // ignore
  }
}

/** Drop the in-memory result so the next login probe hits the network. */
export function invalidateSnapieMe(): void {
  const state = hub();
  state.settled = false;
  state.user = null;
  state.inflight = null;
  clearAuthMeSkip();
}

export function loadSnapieMe(getMe: () => Promise<SnapieMeUser>): Promise<SnapieMeUser | null> {
  const state = hub();
  if (state.settled) return Promise.resolve(state.user);
  if (shouldSkipAuthMe()) {
    state.settled = true;
    state.user = null;
    return Promise.resolve(null);
  }
  if (state.inflight) return state.inflight;

  const request = (async () => {
    try {
      const user = await getMe();
      state.user = user;
      state.settled = true;
      return user;
    } catch (err) {
      const status = typeof (err as { status?: unknown })?.status === 'number'
        ? (err as { status: number }).status
        : 0;
      if (status === 401 || status === 429) noteAuthMeFailure(status);
      state.user = null;
      state.settled = true;
      return null;
    } finally {
      state.inflight = null;
    }
  })();

  state.inflight = request;
  return request;
}

export function resetAuthProbeForTests(): void {
  delete (globalThis as typeof globalThis & { [HUB_KEY]?: Hub })[HUB_KEY];
  clearAuthMeSkip();
}
