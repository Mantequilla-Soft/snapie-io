// Difficulty and enemy data. Pure data only — the engine never hardcodes a wave.

export type AlienKind = "drifter" | "zigzag" | "shrinker" | "armoured";

export type AlienArchetype = {
  kind: AlienKind;
  /** base radius in internal pixels */
  size: number;
  /** base speed in internal pixels per second */
  speed: number;
  /** hits required to destroy */
  hp: number;
  /** base points before the difficulty multiplier */
  points: number;
  body: string;
  shade: string;
  eye: string;
};

export const ARCHETYPES: Record<AlienKind, AlienArchetype> = {
  drifter: {
    kind: "drifter",
    size: 11,
    speed: 26,
    hp: 1,
    points: 10,
    body: "#38b764",
    shade: "#257f4a",
    eye: "#f4f4f4",
  },
  zigzag: {
    kind: "zigzag",
    size: 9,
    speed: 40,
    hp: 1,
    points: 15,
    body: "#41a6f6",
    shade: "#2b6ea8",
    eye: "#f4f4f4",
  },
  shrinker: {
    kind: "shrinker",
    size: 6,
    speed: 58,
    hp: 1,
    points: 25,
    body: "#ef7d57",
    shade: "#b4462f",
    eye: "#1a1c2c",
  },
  armoured: {
    kind: "armoured",
    size: 13,
    speed: 20,
    hp: 2,
    points: 30,
    body: "#a7a7c5",
    shade: "#5d5d81",
    eye: "#73eff7",
  },
};

export type WaveBand = {
  stage: number;
  label: string;
  /** kills needed to clear this stage */
  quota: number;
  /** speed scale applied to every archetype */
  speedScale: number;
  /** points multiplier granted while in this stage */
  multiplier: number;
  /** archetype spawn table (weighted) */
  table: Array<{ kind: AlienKind; weight: number }>;
};

export const WAVES: WaveBand[] = [
  {
    stage: 1,
    label: "HIVE PERIMETER",
    quota: 6,
    speedScale: 1,
    multiplier: 1,
    table: [
      { kind: "drifter", weight: 7 },
      { kind: "zigzag", weight: 3 },
    ],
  },
  {
    stage: 2,
    label: "NEON SWARM",
    quota: 8,
    speedScale: 1.2,
    multiplier: 1.5,
    table: [
      { kind: "drifter", weight: 5 },
      { kind: "zigzag", weight: 4 },
      { kind: "shrinker", weight: 1 },
    ],
  },
  {
    stage: 3,
    label: "CANYON DRONES",
    quota: 10,
    speedScale: 1.45,
    multiplier: 2,
    table: [
      { kind: "drifter", weight: 3 },
      { kind: "zigzag", weight: 4 },
      { kind: "shrinker", weight: 2 },
      { kind: "armoured", weight: 2 },
    ],
  },
  {
    stage: 4,
    label: "STORM VECTOR",
    quota: 12,
    speedScale: 1.7,
    multiplier: 2.5,
    table: [
      { kind: "drifter", weight: 2 },
      { kind: "zigzag", weight: 4 },
      { kind: "shrinker", weight: 3 },
      { kind: "armoured", weight: 3 },
    ],
  },
  {
    stage: 5,
    label: "ORBITAL RING",
    quota: 14,
    speedScale: 2,
    multiplier: 3,
    table: [
      { kind: "zigzag", weight: 4 },
      { kind: "shrinker", weight: 4 },
      { kind: "armoured", weight: 4 },
    ],
  },
];

/** Stages past the table keep ramping: faster aliens, bigger multiplier. */
export function bandForStage(stage: number): WaveBand {
  const clamped = Math.max(1, Math.floor(stage));
  if (clamped <= WAVES.length) return WAVES[clamped - 1]!;
  const last = WAVES[WAVES.length - 1]!;
  const over = clamped - WAVES.length;
  return {
    ...last,
    stage: clamped,
    label: `DEEP SPACE ${over}`,
    quota: last.quota + over * 2,
    speedScale: last.speedScale + over * 0.25,
    multiplier: last.multiplier + over * 0.5,
  };
}

export const RULES = {
  viewWidth: 320,
  viewHeight: 192,
  maxTargets: 6,
  maxMisses: 3,
  roundSeconds: 60,
  basePoints: 10,
};
