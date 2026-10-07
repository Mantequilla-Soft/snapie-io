export type GameId = 'puff-quest' | 'snapie-blast' | 'snapie-rush' | 'snapie-blocks' | 'snapie-jump';
export const GAME_IDS: GameId[] = ['puff-quest', 'snapie-blast', 'snapie-rush', 'snapie-blocks', 'snapie-jump'];

// How a finished run becomes Snapie Points.
// `score` — floor(score * rate / 100), and the `won` flag is ignored.
// `flat-win` — a fixed award, and only when the server settles a win.
// Client score posts for a flat-win game are rejected.
export type GameAwardMode = 'score' | 'flat-win';
export const GAME_AWARD_MODE: Record<GameId, GameAwardMode> = {
  'puff-quest': 'score',
  'snapie-blast': 'score',
  'snapie-rush': 'score',
  'snapie-blocks': 'flat-win',
  'snapie-jump': 'score',
};

// Flat points for one server-settled win. Null on score-mode games.
// 20 matches a 10,000-score solo run at the 0.2% rate, and the daily cap
// still applies (300 / 20 = 15 wins).
export const GAME_FLAT_WIN_POINTS: Record<GameId, number | null> = {
  'puff-quest': null,
  'snapie-blast': null,
  'snapie-rush': null,
  'snapie-blocks': 20,
  'snapie-jump': null,
};

// Percent of score converted to points: floor(score * rate / 100).
// 0.2% for score-mode games: 10,000 score → 20 points.
// The real per-day guardrail is GAMES_DAILY_POINTS_CAP below, not the per-game rate.
// snapie-blocks is flat-win; the rate is unused because client score posts are rejected.
export const GAME_POINTS_CONVERSION_RATE_PCT: Record<GameId, number> = {
  'puff-quest': 0.2,
  'snapie-blast': 0.2,
  'snapie-rush': 0.2,
  'snapie-blocks': 0,
  'snapie-jump': 0.2,
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
  // snapie-blocks does not accept a client score. Wins are a flat server award.
  'snapie-blocks': 0,
  // snapie-jump is endless, so it has no natural ceiling: score = metres * 10 +
  // honey (25, big 250) + stomps (100). A bounce is about one second and climbs
  // at most ~16-22 m, so a flawless run earns roughly 160-220 points per second
  // from height alone. 100,000 is about ten minutes of perfect play (or 10 km),
  // which catches forged scores without capping real ones; the daily points cap
  // is the real limit on what a high score can earn.
  'snapie-jump': 100_000,
};

// Per-user, per-UTC-day cap on games-derived points, summed across ALL gameIds.
// v1 anti-farming guardrail; replay validation is deferred.
export const GAMES_DAILY_POINTS_CAP = 300;
