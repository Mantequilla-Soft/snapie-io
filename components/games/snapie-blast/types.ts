// Shared Snapie contract — copied verbatim from SNAPIE_GAME_BLUEPRINT.md section 3.
// Do not add host-specific fields here.

export type SnapieResult = {
  gameId: string; // stable slug, e.g. "snapie-blast"
  gameVersion: string; // semver of the game build
  sessionId?: string | undefined; // opaque match id from the host
  playerName?: string | undefined;
  score: number;
  stage: number; // stage/level reached
  stagesCleared: number;
  won: boolean; // true = objective completed
  durationMs: number;
  endedAt: number; // unix ms
  replayToken?: string | undefined; // optional: encoded input log for verification
};

export type SnapieEvent =
  | { type: "ready" }
  | { type: "run-start"; sessionId?: string | undefined; startStage: number }
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
  playerName?: string | undefined;
  sessionId?: string | undefined;
  startStage?: number;
  autoStart?: boolean;
  showMenus?: boolean; // false = host draws its own shell
  showTouchControls?: boolean | "auto";
  keyboard?: boolean;
  maxWidth?: number;
  onEvent?: (e: SnapieEvent) => void;
  onResult?: (r: SnapieResult) => void;
};

/** HUD payload emitted with every `hud` event. */
export type SnapieBlastHud = {
  score: number;
  multiplier: number;
  timeLeft: number;
  misses: number;
  maxMisses: number;
  stage: number;
  targets: number;
  hits: number;
};
