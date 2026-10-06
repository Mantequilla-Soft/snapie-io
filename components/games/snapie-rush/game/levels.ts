// Routes as pure data. The engine never hardcodes a route.

export type HazardType = "truck" | "swerver" | "oil" | "drone" | "rival";

export type DensityBand = {
  /** Where this band starts along the route, 0..1. */
  from: number;
  /** Average seconds between hazard spawns during this band. */
  interval: number;
  /** Relative weights per hazard type. */
  weights: Partial<Record<HazardType, number>>;
};

export type RouteTheme = {
  sky: string;
  ground: string;
  road: string;
  roadEdge: string;
  lane: string;
  /** Roadside decoration colours, drawn as parallax blocks. */
  props: string[];
  /** 0 = flat blocks, 1 = tall blocks, 2 = arches/pylons. */
  propStyle: 0 | 1 | 2;
};

export type Route = {
  id: string;
  name: string;
  /** Route length in world pixels. */
  length: number;
  /** Road width curve, sampled evenly from start to finish (world px). */
  widthCurve: number[];
  /** Base scroll speed in px/sec at the start of the route. */
  baseSpeed: number;
  /** Scroll speed in px/sec at the finish line. */
  finishSpeed: number;
  /** Average seconds between fuel cell spawns. */
  fuelInterval: number;
  /** Fuel burned per second at full throttle. */
  fuelBurn: number;
  hazards: DensityBand[];
  theme: RouteTheme;
};

export const ROUTES: Route[] = [
  {
    id: "meadow-highway",
    name: "Meadow Highway",
    length: 9000,
    widthCurve: [180, 176, 172, 176, 168, 172, 164, 168],
    baseSpeed: 92,
    finishSpeed: 132,
    fuelInterval: 3.4,
    fuelBurn: 3.6,
    hazards: [
      { from: 0, interval: 1.5, weights: { truck: 3, swerver: 2 } },
      { from: 0.4, interval: 1.2, weights: { truck: 3, swerver: 3, oil: 1 } },
      { from: 0.75, interval: 1.0, weights: { truck: 3, swerver: 3, oil: 2, drone: 1 } },
    ],
    theme: {
      sky: "#1a1c2c",
      ground: "#2c5c3a",
      road: "#33344a",
      roadEdge: "#f4f4f4",
      lane: "#5d5f7a",
      props: ["#38b764", "#257f4b"],
      propStyle: 0,
    },
  },
  {
    id: "neon-city",
    name: "Neon City",
    length: 10500,
    widthCurve: [168, 160, 164, 152, 156, 148, 152, 144],
    baseSpeed: 108,
    finishSpeed: 152,
    fuelInterval: 3.9,
    fuelBurn: 4.0,
    hazards: [
      { from: 0, interval: 1.25, weights: { truck: 2, swerver: 3, oil: 1 } },
      { from: 0.35, interval: 1.05, weights: { truck: 2, swerver: 3, oil: 2, drone: 2 } },
      { from: 0.7, interval: 0.9, weights: { swerver: 3, oil: 2, drone: 2, rival: 2 } },
    ],
    theme: {
      sky: "#151428",
      ground: "#241d3a",
      road: "#2b2c44",
      roadEdge: "#41ead4",
      lane: "#4d4a7a",
      props: ["#ef7d57", "#41ead4", "#a86edb"],
      propStyle: 1,
    },
  },
  {
    id: "canyon-run",
    name: "Canyon Run",
    length: 12000,
    widthCurve: [156, 148, 152, 140, 144, 132, 138, 128],
    baseSpeed: 122,
    finishSpeed: 172,
    fuelInterval: 4.4,
    fuelBurn: 4.4,
    hazards: [
      { from: 0, interval: 1.1, weights: { truck: 3, swerver: 2, oil: 2 } },
      { from: 0.35, interval: 0.95, weights: { truck: 3, swerver: 3, oil: 2, drone: 2 } },
      { from: 0.7, interval: 0.8, weights: { truck: 2, swerver: 3, oil: 2, drone: 3, rival: 2 } },
    ],
    theme: {
      sky: "#2a1a20",
      ground: "#7a4230",
      road: "#3a3040",
      roadEdge: "#ffcd75",
      lane: "#6b5560",
      props: ["#b55a3c", "#8a3f2b", "#e0a060"],
      propStyle: 1,
    },
  },
  {
    id: "storm-coast",
    name: "Storm Coast",
    length: 13500,
    widthCurve: [148, 136, 142, 128, 134, 122, 128, 118],
    baseSpeed: 136,
    finishSpeed: 190,
    fuelInterval: 5.0,
    fuelBurn: 4.8,
    hazards: [
      { from: 0, interval: 1.0, weights: { truck: 2, swerver: 3, oil: 3 } },
      { from: 0.35, interval: 0.85, weights: { truck: 2, swerver: 3, oil: 3, drone: 3 } },
      { from: 0.7, interval: 0.72, weights: { swerver: 3, oil: 3, drone: 3, rival: 3 } },
    ],
    theme: {
      sky: "#121a2c",
      ground: "#1d3b52",
      road: "#2f3346",
      roadEdge: "#8ecae6",
      lane: "#4a5570",
      props: ["#2e6b8a", "#8ecae6"],
      propStyle: 2,
    },
  },
  {
    id: "orbital-ring",
    name: "Orbital Ring",
    length: 15000,
    widthCurve: [138, 128, 132, 120, 124, 112, 118, 108],
    baseSpeed: 152,
    finishSpeed: 214,
    fuelInterval: 5.6,
    fuelBurn: 5.2,
    hazards: [
      { from: 0, interval: 0.92, weights: { swerver: 3, drone: 2, oil: 2 } },
      { from: 0.35, interval: 0.78, weights: { truck: 2, swerver: 3, oil: 2, drone: 3, rival: 2 } },
      { from: 0.7, interval: 0.66, weights: { swerver: 3, oil: 3, drone: 4, rival: 3 } },
    ],
    theme: {
      sky: "#0d0c1c",
      ground: "#161532",
      road: "#232244",
      roadEdge: "#41ead4",
      lane: "#3b3a6a",
      props: ["#41ead4", "#a86edb", "#f4f4f4"],
      propStyle: 2,
    },
  },
];

/** Hidden route, unlocked at a high cumulative score (stored on the device). */
export const BONUS_ROUTE: Route = {
  id: "hive-core",
  name: "Hive Core",
  length: 16000,
  widthCurve: [132, 118, 124, 110, 116, 104, 110, 100],
  baseSpeed: 168,
  finishSpeed: 236,
  fuelInterval: 6.2,
  fuelBurn: 5.6,
  hazards: [
    { from: 0, interval: 0.8, weights: { swerver: 3, drone: 3, oil: 2, rival: 2 } },
    { from: 0.4, interval: 0.68, weights: { truck: 2, swerver: 3, oil: 3, drone: 4, rival: 3 } },
    { from: 0.75, interval: 0.58, weights: { swerver: 4, oil: 3, drone: 4, rival: 4 } },
  ],
  theme: {
    sky: "#1a1c2c",
    ground: "#3d2f0a",
    road: "#2b2a1c",
    roadEdge: "#ffcd75",
    lane: "#6b5f2a",
    props: ["#ffcd75", "#ef7d57", "#41ead4"],
    propStyle: 2,
  },
};

export const BONUS_UNLOCK_SCORE = 30000;

export function getRoutes(bonusUnlocked: boolean): Route[] {
  return bonusUnlocked ? [...ROUTES, BONUS_ROUTE] : [...ROUTES];
}
