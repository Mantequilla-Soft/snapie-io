export type GameId = 'puff-quest' | 'snapie-blast';
export const GAME_IDS: GameId[] = ['puff-quest', 'snapie-blast'];

// Percent of score converted to points: floor(score * rate / 100).
// 0.2% for all games: 10,000 score → 20 points.
// The real per-day guardrail is GAMES_DAILY_POINTS_CAP below, not the per-game rate.
export const GAME_POINTS_CONVERSION_RATE_PCT: Record<GameId, number> = {
  'puff-quest': 0.2,
  'snapie-blast': 0.2,
};

// Per-game sanity ceiling on a single submitted score.
// Matches puff-quest's own upstream bound (kirby-dash-quest/src/lib/scores.functions.ts).
// snapie-blast is a hard-capped 60s round (src/game/waves.ts RULES.roundSeconds);
// a perfect run tops out around the low tens of thousands, so 50,000 leaves
// generous headroom while still catching obviously-forged scores.
export const GAME_MAX_SCORE: Record<GameId, number> = {
  'puff-quest': 200_000,
  'snapie-blast': 50_000,
};

// Per-user, per-UTC-day cap on games-derived points, summed across ALL gameIds.
// v1 anti-farming guardrail; replay validation is deferred.
export const GAMES_DAILY_POINTS_CAP = 300;
