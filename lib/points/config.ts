// Snapie Points gating. Mirrors the discovery-engine allowlist precedent
// (see lib/discovery/config.ts): dogfooded behind an account allowlist first,
// widened later. The NEXT_PUBLIC flag + list gate the UI; the server-only list
// (isPointsAllowedServer) is what actually authorizes an award — the client
// gate is never trusted.

export const POINTS_FEATURE_FLAG = process.env.NEXT_PUBLIC_ENABLE_POINTS === 'true';

function parseList(raw: string | undefined, fallback: string): string[] {
  return (raw || fallback)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

const CLIENT_ALLOWLIST = parseList(process.env.NEXT_PUBLIC_POINTS_ALLOWLIST, 'meno,snapieapp');

/** UI-side gate — decides whether points affordances render. Never authoritative;
 *  the award route re-checks server-side. */
export function isPointsEnabledFor(username?: string | null): boolean {
  return POINTS_FEATURE_FLAG && !!username && CLIENT_ALLOWLIST.includes(username.toLowerCase());
}

// Server-only allowlist (no NEXT_PUBLIC prefix, so it isn't shipped to the
// browser). Falls back to the public list so a single-env dogfood setup still
// works. Deliberately independent of POINTS_FEATURE_FLAG — that flag is a client
// UI switch; server eligibility is purely membership in this list.
const SERVER_ALLOWLIST = parseList(
  process.env.POINTS_ALLOWLIST ?? process.env.NEXT_PUBLIC_POINTS_ALLOWLIST,
  'meno,snapieapp',
);

/** Authoritative gate used by POST /api/points/award. */
export function isPointsAllowedServer(username?: string | null): boolean {
  return !!username && SERVER_ALLOWLIST.includes(username.toLowerCase());
}
