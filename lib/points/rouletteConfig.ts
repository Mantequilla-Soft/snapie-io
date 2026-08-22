// Odds — see internal-docs/snapie-points-marketplace-roadmap.md, "Feature
// spec — Points Roulette" section, for the full history. Retuned twice:
// - v1, RTP 50%: a 14-loss streak (~1-in-37) read as "broken" to a real
//   player even though the RNG was correct.
// - v2, RTP 74.5%: measurably better (a 14-loss streak became ~1-in-415),
//   but a 21-spin sample still ran hot on losses (76% vs the expected 65%
//   — not statistically damning on its own at that sample size, but paired
//   with repeated "still doesn't feel good" feedback, felt experience won
//   out over "the sample size doesn't clear significance").
// Now at RTP 84.5% — a real house edge (15.5%) still shrinks the point
// supply on average, but it's much closer to a normal casino slot than a
// lottery at this point. If this still doesn't feel right, the next lever
// isn't the loss rate — it's already fairly low — it's whether a jackpot
// tail this rare is still worth keeping distinct from 2x/3x at all.
export type RouletteMultiplier = 0 | 2 | 3 | 5;

// Cumulative thresholds out of 10,000 (basis points). A roll from
// crypto.randomInt(0, 10000) maps to the first entry whose threshold it's
// below. Order matters — must stay ascending, and the last entry must be
// 10000 so every possible roll lands somewhere.
export const ROULETTE_ODDS_BP: { multiplier: RouletteMultiplier; thresholdBp: number }[] = [
  { multiplier: 0, thresholdBp: 6000 }, // 60.00% lose
  { multiplier: 2, thresholdBp: 9650 }, // +36.50% double
  { multiplier: 3, thresholdBp: 9950 }, // +3.00% triple
  { multiplier: 5, thresholdBp: 10000 }, // +0.50% jackpot
];

export const MIN_STAKE = 10;
export const MAX_STAKE = 1000;

// Quick-pick buttons; free-form entry still allowed within the bounds above
// — same pattern as purchaseConfig.ts's PURCHASE_PRESETS_HBD. 10 added as a
// true "just try it" stake, cheap enough to spin many times while testing
// or just messing around without burning through a balance fast.
export const STAKE_PRESETS = [10, 50, 100, 250, 500];

// Minimum time between two spins by the same user. Blunts macro/script spam
// independently of the house edge already discouraging it economically.
export const SPIN_COOLDOWN_MS = 2000;
