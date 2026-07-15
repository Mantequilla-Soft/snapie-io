// Snapie Points gating.
//
// Two independent concerns, deliberately not conflated:
//   1. Rollout switch — POINTS_FEATURE_FLAG ships the whole feature dark until
//      flipped on (same ship-dark pattern as the discovery engine).
//   2. Eligibility — who actually earns. The model is a BLOCKLIST, not an
//      allowlist: everyone earns EXCEPT accounts muted in the Snapie community
//      (enforced server-side via mutedAccountsManager — see the award route).
//
// The allowlist below is only an OPTIONAL dogfood restriction: empty by default
// (= everyone eligible), set it to soft-launch earning to a few test accounts
// before opening it up. It is never the eligibility model on its own.

export const POINTS_FEATURE_FLAG = process.env.NEXT_PUBLIC_ENABLE_POINTS === 'true';

function parseList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

const CLIENT_ALLOWLIST = parseList(process.env.NEXT_PUBLIC_POINTS_ALLOWLIST);

/** UI-side gate — decides whether points affordances render. Feature on + logged
 *  in, and (only if a dogfood allowlist is configured) membership in it. Does
 *  NOT check community mutes — that's server-authoritative, so a muted account
 *  might see the affordance but simply never earns. */
export function isPointsEnabledFor(username?: string | null): boolean {
  if (!POINTS_FEATURE_FLAG || !username) return false;
  if (CLIENT_ALLOWLIST.length > 0) return CLIENT_ALLOWLIST.includes(username.toLowerCase());
  return true;
}

// Server-only dogfood restriction (no NEXT_PUBLIC prefix). Empty = everyone
// passes this gate; the mute check in the award route is what actually excludes.
const SERVER_ALLOWLIST = parseList(process.env.POINTS_ALLOWLIST ?? process.env.NEXT_PUBLIC_POINTS_ALLOWLIST);

/** Optional dogfood allowlist gate, checked before the mute blocklist. Empty
 *  allowlist ⇒ everyone passes (production model). */
export function passesPointsAllowlist(username?: string | null): boolean {
  if (!username) return false;
  if (SERVER_ALLOWLIST.length === 0) return true;
  return SERVER_ALLOWLIST.includes(username.toLowerCase());
}
