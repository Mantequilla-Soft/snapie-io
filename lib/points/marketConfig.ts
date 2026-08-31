// Tunables for The Pile (the Snapie Points item market), mirroring the shape
// of rouletteConfig.ts.

// Floor for both admin-seeded and user-created items — cheap enough that a
// starter item (Phase 0's poop/cookie/hotdog) is trivially affordable, high
// enough that a 30% burn on every sale is a real cost, not a rounding error.
export const ITEM_MIN_PRICE = 10;

// Burned in full the moment an item is submitted for review — approved or
// not. The real anti-spam lever (see the plan doc's design decision 3): a
// daily cap limits volume, this limits low-effort submissions specifically,
// since losing it on rejection is what makes someone think before uploading
// junk.
export const ITEM_CREATION_FEE = 50;

// Per-user, per-UTC-day cap on *submissions* (pending + approved + rejected
// all count) — same shape as DAILY_CAP in constants.ts, just for a market
// action rather than an earn action.
export const ITEM_CREATION_DAILY_CAP = 3;

// Creator's cut of a sale, in basis points out of 10,000. The remainder is
// burned (not paid to anyone) — see the plan doc's design decision 2 for why
// a straight burn, rather than paying it to the platform, is what keeps an
// alt-account self-buy loop from being a free-money glitch instead of just a
// lossy way to move points between two accounts you control.
export const ITEM_CREATOR_SHARE_BP = 7000;

// Cap on how many recent throwers getPile() returns per item — also mirrored
// client-side by PileTray's optimistic local patch, so the two never drift
// (a very hot item shouldn't grow the client's list past what a fresh fetch
// would ever show).
export const MAX_THROWERS_PER_ITEM = 50;
