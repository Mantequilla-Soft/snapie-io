export type GameId = 'puff-quest' | 'snapie-blast' | 'snapie-rush';
export const GAME_IDS: GameId[] = ['puff-quest', 'snapie-blast', 'snapie-rush'];

// Percent of score converted to points: floor(score * rate / 100).
// 0.2% for all games: 10,000 score → 20 points.
// The real per-day guardrail is GAMES_DAILY_POINTS_CAP below, not the per-game rate.
export const GAME_POINTS_CONVERSION_RATE_PCT: Record<GameId, number> = {
  'puff-quest': 0.2,
  'snapie-blast': 0.2,
  'snapie-rush': 0.2,
};

// Per-game sanity ceiling on a single submitted score.
// Matches puff-quest's own upstream bound (kirby-dash-quest/src/lib/scores.functions.ts).
// snapie-blast is a hard-capped 60s round (src/game/waves.ts RULES.roundSeconds);
// a perfect run tops out around the low tens of thousands, so 50,000 leaves
// generous headroom while still catching obviously-forged scores.
export const GAME_MAX_SCORE: Record<GameId, number> = {
  'puff-quest': 200_000,
  'snapie-blast': 50_000,
  // snapie-rush: score = distance/10 x speed tier (1-5) + 1500+250*tier per route
  // cleared + 60*tier per near miss + fuel/rival bonuses. Five routes (60,000
  // world px) plus the hidden 16,000px bonus route, flat out at tier 5, come to
  // roughly 33,000 distance + 16,500 stage-clear points, so a perfect run with
  // plenty of near misses lands in the 60-80k range. 100,000 leaves headroom while
  // still catching obviously-forged scores.
  'snapie-rush': 100_000,
};

// Per-user, per-UTC-day cap on games-derived points, summed across ALL gameIds.
// v1 anti-farming guardrail; replay validation is deferred.
export const GAMES_DAILY_POINTS_CAP = 300;
