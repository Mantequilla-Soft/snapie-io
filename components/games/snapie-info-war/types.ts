export const GAME_ID = "snapie-info-war" as const;
export const GAME_VERSION = "1.0.0" as const;

export type SnapiePhase = "idle" | "intro" | "stage-card" | "playing" | "paused" | "stage-clear" | "game-over" | "won";

export interface SnapieHud {
  score: number;
  lives: number;
  hp: number;
  maxHp: number;
  weapon: string;
  weaponLevel: number;
  stage: number; // 1-based
  bossHp: number | null; // 0..1 when a boss is active
  phase: SnapiePhase;
}

export interface SnapieResult {
  gameId: typeof GAME_ID;
  gameVersion: typeof GAME_VERSION;
  sessionId: string;
  playerName: string;
  score: number;
  stage: number; // 1-based stage the run ended on
  stagesCleared: number;
  won: boolean;
  durationMs: number;
  endedAt: number; // unix ms (the scores API expects a number)
  replayToken?: string;
}

export type SnapieEvent =
  | { type: "ready"; sessionId: string; playerName: string }
  | { type: "run-start"; sessionId: string; stage: number }
  | { type: "hud"; hud: SnapieHud }
  | { type: "stage-clear"; stage: number; score: number }
  | { type: "game-over"; result: SnapieResult }
  | { type: "win"; result: SnapieResult };

export interface SnapieControls {
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  getPhase(): SnapiePhase;
  getHud(): SnapieHud;
}

export interface SnapieOptions {
  playerName?: string;
  sessionId?: string;
  /** 1-based stage to start on (1..5). */
  startStage?: number;
  autoStart?: boolean;
  /** Show the built-in title / options / game-over menus. Default true. */
  showMenus?: boolean;
  /** Show on-screen touch buttons. Default: auto (true on touch devices). */
  showTouchControls?: boolean;
  /** Listen to window keyboard events. Default true. */
  keyboard?: boolean;
  /** Max CSS width of the canvas in px. Default: fill the container. */
  maxWidth?: number;
  onEvent?: (event: SnapieEvent) => void;
  onResult?: (result: SnapieResult) => void;
}

/** Envelope posted to window.parent when running inside an iframe. */
export interface SnapieParentMessage { source: "snapie-game"; gameId: typeof GAME_ID; event: SnapieEvent }
/** Command a host page may post into the iframe. */
export interface SnapieHostCommand { target: typeof GAME_ID; command: "start" | "pause" | "resume" | "reset" }

export interface SnapieMountHandle extends SnapieControls { destroy(): void }
