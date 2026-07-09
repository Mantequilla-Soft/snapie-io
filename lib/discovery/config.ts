// Discovery Engine gating. Mirrors the only existing feature-flag precedent
// in this app (NEXT_PUBLIC_ENABLE_BLENDED_FEED). Dogfooded first behind an
// account allowlist (meno/snapieapp only); widened to every logged-in user
// once the core mechanisms were verified against real data — see
// internal-docs/discovery-engine-grand-plan.md for the full history and
// what's still outstanding. The flag itself remains the rollback switch:
// flipping NEXT_PUBLIC_ENABLE_DISCOVERY_SNAPS off requires a rebuild + pm2
// restart, same friction the blended-feed flag already has, not a gap to fix.
export const DISCOVERY_FEATURE_FLAG = process.env.NEXT_PUBLIC_ENABLE_DISCOVERY_SNAPS === 'true';

export function isDiscoveryEnabledFor(username: string | null | undefined): boolean {
    return DISCOVERY_FEATURE_FLAG && !!username;
}

// Dogfooding tuning knob, not a deploy toggle — a plain constant so changing
// it during testing is a one-line diff with no infra behind it.
export const DISCOVERY_INTERLEAVE_EVERY_N = 5;
