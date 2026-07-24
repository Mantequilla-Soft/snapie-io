// Fixed rate, deliberately NOT priced off a live HBD/USD feed — see
// internal-docs/snapie-points-marketplace-roadmap.md, Phase 1 pricing
// section, for why. Revisit only if HBD ever depegs meaningfully.
export const POINTS_PER_HBD = 100;

export const MIN_PURCHASE_HBD = 1;
export const MAX_PURCHASE_HBD = 1000;

// Preset amounts shown as quick-pick buttons; free-form entry is still
// allowed within the min/max bounds above.
export const PURCHASE_PRESETS_HBD = [1, 5, 10, 25];

// Receiving account for points purchases. Defaults to the existing,
// already-controlled @snapie account (same one used for patron support) so
// Phase 1 doesn't depend on standing up new account infrastructure — swap to
// a dedicated treasury account later via this env var alone, no code change.
export const POINTS_RECEIVING_ACCOUNT = process.env.NEXT_PUBLIC_POINTS_RECEIVING_ACCOUNT || 'snapie';

export function hbdToPoints(hbdAmount: number): number {
  return Math.floor(hbdAmount * POINTS_PER_HBD);
}
