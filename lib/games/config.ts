export type GameId = 'puff-quest';
export const GAME_IDS: GameId[] = ['puff-quest'];

// Percent of score converted to points: floor(score * rate / 100).
// 0.2% for puff-quest: 10,000 score → 20 points.
export const GAME_POINTS_CONVERSION_RATE_PCT: Record<GameId, number> = {
  'puff-quest': 0.2,
};

// Per-game sanity ceiling on a single submitted score.
// Matches puff-quest's own upstream bound (kirby-dash-quest/src/lib/scores.functions.ts).
export const GAME_MAX_SCORE: Record<GameId, number> = {
  'puff-quest': 200_000,
};

// Per-user, per-UTC-day cap on games-derived points, summed across ALL gameIds.
// v1 anti-farming guardrail; replay validation is deferred.
export const GAMES_DAILY_POINTS_CAP = 300;
