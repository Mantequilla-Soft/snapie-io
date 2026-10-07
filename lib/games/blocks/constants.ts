/** Snapie Blocks — shared rules for the client engine and the match server. */

export const BLOCKS_GAME_ID = 'snapie-blocks';

/** Flat Snapie Points for one server-settled win. Mirrors GAME_FLAT_WIN_POINTS. */
export const BLOCKS_WIN_POINTS = 20;

/** Short-poll cadence for queue and in-match garbage / HP. */
export const BLOCKS_POLL_MS = 400;

/** How long a public queue ticket lives before the client must retry. */
export const BLOCKS_QUEUE_TIMEOUT_MS = 45_000;

/** No poll / attack inside this window and the other board wins by forfeit. */
export const BLOCKS_DISCONNECT_MS = 12_000;

/** A waiting ticket is only matchable while its owner is still polling. */
export const BLOCKS_QUEUE_PRESENCE_MS = 12_000;

/** Active matches are refreshed on each poll; this is the idle TTL. */
export const BLOCKS_MATCH_TTL_MS = 2 * 60 * 60 * 1000;

/** Finished matches stay readable long enough to show the result, then TTL out. */
export const BLOCKS_RESULT_TTL_MS = 30 * 60 * 1000;

export const BLOCKS_HP_MAX = 100;

/** One garbage line (not one cleared line) costs this much opponent HP. */
export const BLOCKS_HP_PER_GARBAGE_LINE = 10;

/** Minimum gap between accepted line-clears. Stops a client from flooding attacks. */
export const BLOCKS_ATTACK_MIN_MS = 160;

export const BLOCKS_BOARD_W = 10;
export const BLOCKS_BOARD_H = 20;

/**
 * Classic guideline line → garbage, without spins or combos:
 * single 0, double 1, triple 2, tetris 4.
 * Returns null when `lines` is not a legal clear.
 */
export function garbageForLines(lines: number): number | null {
  switch (lines) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 4;
    default:
      return null;
  }
}
