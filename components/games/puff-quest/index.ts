/**
 * Snapie Quest — embeddable game SDK.
 *
 * React host:   import { PuffQuest } from "@/components/games/puff-quest";
 * Any host:     import { mountPuffQuest } from "@/components/games/puff-quest";
 *
 * The package has no dependency on this site's router, styling or backend.
 */
export { PuffQuest, type PuffQuestProps } from "./PuffQuest";
export { mountPuffQuest, type PuffQuestInstance } from "./mount";
export type {
  Hud,
  Power,
  PuffQuestControls,
  PuffQuestEvent,
  PuffQuestOptions,
  PuffQuestPhase,
  PuffQuestResult,
} from "./types";

// Low-level pieces, for hosts that want to build their own shell.
export { Game, VIEW_W, VIEW_H, TILE, STAGE_COUNT, type EngineEvents, type InputKey } from "./game/engine";
export { LEVELS, type LevelDef, type EnemyKind } from "./game/levels";
