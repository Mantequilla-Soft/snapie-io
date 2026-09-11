import type { Hud, Power } from "./game/engine";

export type { Hud, Power };

/** Result of a finished run — this is what a host app would sign / post on-chain. */
export type PuffQuestResult = {
  sessionId?: string | undefined;
  playerName?: string | undefined;
  score: number;
  stage: number;
  stagesCleared: number;
  won: boolean;
  /** ms the run lasted, wall clock */
  durationMs: number;
  /** unix ms when the run ended */
  endedAt: number;
};

export type PuffQuestEvent =
  | { type: "ready" }
  | { type: "run-start"; sessionId?: string | undefined; startStage: number }
  | { type: "hud"; hud: Hud }
  | { type: "stage-clear"; stage: number; score: number }
  | { type: "game-over"; result: PuffQuestResult }
  | { type: "win"; result: PuffQuestResult };

export type PuffQuestPhase = "title" | "howto" | "playing" | "stageclear" | "gameover" | "win";

export type PuffQuestControls = {
  /** Begin a fresh run (optionally from a given stage, 1-based). */
  start: (startStage?: number) => void;
  pause: () => void;
  resume: () => void;
  /** Back to the title screen. */
  reset: () => void;
  getPhase: () => PuffQuestPhase;
  getHud: () => Hud;
};

export type PuffQuestOptions = {
  /** Shown in results; the host decides what to do with it. */
  playerName?: string | undefined;
  /** Opaque id echoed back in results — useful for wagered matches. */
  sessionId?: string | undefined;
  /** 1-based stage to begin on. Default 1. */
  startStage?: number;
  /** Skip the title screen and start immediately. Default false. */
  autoStart?: boolean;
  /** Show the built-in title/how-to screens. Default true. */
  showMenus?: boolean;
  /** Show on-screen touch buttons on small screens. Default true. */
  showTouchControls?: boolean | "auto" | undefined;
  /** Listen for keyboard on window. Default true. */
  keyboard?: boolean;
  /** Max width of the game frame in px. Default 900. */
  maxWidth?: number;
  onEvent?: (event: PuffQuestEvent) => void;
  onResult?: (result: PuffQuestResult) => void;
};
