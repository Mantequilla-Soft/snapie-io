// Shared Snapie Game contract — copied verbatim from SNAPIE_GAME_BLUEPRINT.md section 3.
// Do not diverge: the Hive host stores results from every Snapie title in one collection.

export type SnapieResult = {
  gameId: string; // stable slug, e.g. "snapie-quest"
  gameVersion: string; // semver of the game build
  sessionId?: string; // opaque match id from the host
  playerName?: string;
  score: number;
  stage: number; // stage/level reached
  stagesCleared: number;
  won: boolean; // true = objective completed
  durationMs: number;
  endedAt: number; // unix ms
  replayToken?: string; // optional: encoded input log for verification
};

export type SnapieEvent =
  | { type: "ready" }
  | { type: "run-start"; sessionId?: string; startStage: number }
  | { type: "hud"; hud: unknown }
  | { type: "stage-clear"; stage: number; score: number }
  | { type: "game-over"; result: SnapieResult }
  | { type: "win"; result: SnapieResult };

export type SnapieControls = {
  start: (startStage?: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  getPhase: () => string;
  getHud: () => unknown;
};

export type SnapieOptions = {
  playerName?: string;
  sessionId?: string;
  startStage?: number;
  autoStart?: boolean;
  showMenus?: boolean; // false = host draws its own shell
  showTouchControls?: boolean | "auto";
  keyboard?: boolean;
  maxWidth?: number;
  onEvent?: (e: SnapieEvent) => void;
  onResult?: (r: SnapieResult) => void;
};

// ---- Snapie Jump specifics (additive, contract above stays untouched) ----

/** Game-specific stats attached to every Snapie Jump result under `meta`. */
export type SnapieJumpMeta = {
  height: number; // metres climbed
  honey: number; // honey drops collected (big honey counts as 1)
  isNewBest: boolean;
};

export type SnapieJumpResult = SnapieResult & { meta: SnapieJumpMeta };

export type SnapieJumpPhase = "idle" | "running" | "paused" | "dying" | "game-over";

export type SnapieJumpHud = {
  height: number;
  score: number;
  honey: number;
  best: number;
  phase: SnapieJumpPhase;
  superJump: number; // seconds left
  magnet: number; // seconds left
  shield: boolean;
};

export const SNAPIE_JUMP_GAME_ID = "snapie-jump";
export const SNAPIE_JUMP_GAME_VERSION = "1.0.0";
