// Snapie Rush engine: fixed-timestep loop, road physics, hazards, scoring, rendering.
// Framework-agnostic. Must not import site routes, leaderboards or any backend.

import {
  BONUS_UNLOCK_SCORE,
  getRoutes,
  type DensityBand,
  type HazardType,
  type Route,
} from "./levels";
import {
  SNAPIE_RUSH_GAME_ID,
  SNAPIE_RUSH_GAME_VERSION,
  type SnapieEvent,
  type SnapieResult,
  type SnapieRushHud,
  type SnapieRushPhase,
} from "../types";

export const VIEW_W = 320;
export const VIEW_H = 192;

const STEP = 1 / 60;
const BIKE_W = 14;
const BIKE_H = 20;
const BIKE_SCREEN_Y = VIEW_H - 46;
const STEER_SPEED = 118;
const CURVE_AMP = 11;
const BONUS_STORAGE_KEY = "snapie-rush:bonus-unlocked";
const BEST_STORAGE_KEY = "snapie-rush:best-score";

type Entity = {
  type: HazardType | "fuel";
  x: number;
  worldY: number;
  w: number;
  h: number;
  vx: number;
  ownSpeed: number;
  seed: number;
  travelled: number;
  target: number;
  locked: boolean;
  scored: boolean;
  hit: boolean;
};

export type EngineOptions = {
  onEvent?: ((e: SnapieEvent) => void) | undefined;
  onResult?: ((r: SnapieResult) => void) | undefined;
  playerName?: string | undefined;
  sessionId?: string | undefined;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
function readFlag(key: string, fallback = false) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return fallback;
  }
}

export function isBonusUnlocked() {
  return readFlag(BONUS_STORAGE_KEY);
}

export function bestScore() {
  if (typeof localStorage === "undefined") return 0;
  try {
    return Number(localStorage.getItem(BEST_STORAGE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function createEngine(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  ctx.imageSmoothingEnabled = false;

  let routes: Route[] = getRoutes(isBonusUnlocked());
  let phase: SnapieRushPhase = "idle";
  let stageIndex = 0;
  let stagesCleared = 0;
  let score = 0;
  let hearts = 3;
  let fuel = 1;
  let distance = 0;
  let speed = 0;
  let bikeX = VIEW_W / 2;
  let bikeVX = 0;
  let spin = 0;
  let invuln = 0;
  let shake = 0;
  let flash = 0;
  let banner = "";
  let bannerTimer = 0;
  let entities: Entity[] = [];
  let spawnTimer = 0;
  let fuelTimer = 0;
  let elapsed = 0;
  let runStart = 0;
  let inputLog: number[][] = [];
  let input = { left: false, right: false, accel: false, brake: false };
  let lastDir = 0;
  let raf = 0;
  let lastTime = 0;
  let acc = 0;
  let destroyed = false;

  const emit = (e: SnapieEvent) => options.onEvent?.(e);
  const route = (): Route => routes[Math.min(stageIndex, routes.length - 1)] as Route;

  function widthAt(worldY: number) {
    const r = route();
    const t = clamp(worldY / r.length, 0, 1);
    const c = r.widthCurve;
    const f = t * (c.length - 1);
    const i = Math.min(Math.floor(f), c.length - 2);
    return lerp(c[i] as number, c[i + 1] as number, f - i);
  }
  function centerAt(worldY: number) {
    return VIEW_W / 2 + Math.sin(worldY * 0.0012) * CURVE_AMP;
  }

  const bikeWorldY = () => distance + (VIEW_H - BIKE_SCREEN_Y);
  const speedRatio = () => clamp(speed / route().finishSpeed, 0, 1.2);
  const speedTier = () => clamp(Math.floor(speedRatio() * 5) + 1, 1, 5);

  function hud(): SnapieRushHud {
    return {
      score: Math.floor(score),
      stage: stageIndex + 1,
      stageName: route().name,
      hearts,
      fuel: clamp(fuel, 0, 1),
      speed: clamp(speedRatio(), 0, 1),
      speedTier: speedTier(),
      progress: clamp(distance / route().length, 0, 1),
      phase,
    };
  }

  let hudTick = 0;
  function pushHud() {
    emit({ type: "hud", hud: hud() });
  }

  function resetRun(startStage: number) {
    routes = getRoutes(isBonusUnlocked());
    stageIndex = clamp(startStage, 0, routes.length - 1);
    stagesCleared = 0;
    score = 0;
    hearts = 3;
    elapsed = 0;
    inputLog = [];
    resetStage();
  }

  function resetStage() {
    distance = 0;
    speed = route().baseSpeed * 0.55;
    bikeX = VIEW_W / 2;
    bikeVX = 0;
    fuel = 1;
    spin = 0;
    invuln = 1;
    entities = [];
    spawnTimer = 0.8;
    fuelTimer = 1.6;
  }

  function pickHazard(): HazardType {
    const r = route();
    const t = clamp(distance / r.length, 0, 1);
    let band = r.hazards[0] as DensityBand;
    for (const b of r.hazards) if (t >= b.from) band = b;
    const entriesList = Object.entries(band.weights) as [HazardType, number][];
    const total = entriesList.reduce((s, [, w]) => s + w, 0);
    let roll = Math.random() * total;
    for (const [type, w] of entriesList) {
      roll -= w;
      if (roll <= 0) return type;
    }
    return (entriesList[0] as [HazardType, number])[0];
  }

  function spawnInterval() {
    const r = route();
    const t = clamp(distance / r.length, 0, 1);
    let band = r.hazards[0] as DensityBand;
    for (const b of r.hazards) if (t >= b.from) band = b;
    return band.interval * (0.7 + Math.random() * 0.6);
  }

  function spawnHazard() {
    const worldY = distance + VIEW_H + 24;
    const w = widthAt(worldY);
    const c = centerAt(worldY);
    const type = pickHazard();
    const base: Entity = {
      type,
      x: c + (Math.random() - 0.5) * (w - 40),
      worldY,
      w: 16,
      h: 22,
      vx: 0,
      ownSpeed: 0,
      seed: Math.random() * 100,
      travelled: 0,
      target: 0,
      locked: false,
      scored: false,
      hit: false,
    };
    if (type === "truck") {
      base.w = 22;
      base.h = 34;
      base.ownSpeed = 0.38;
    } else if (type === "swerver") {
      base.w = 16;
      base.h = 24;
      base.ownSpeed = 0.5;
    } else if (type === "oil") {
      base.w = 24;
      base.h = 12;
      base.ownSpeed = 0;
    } else if (type === "drone") {
      base.w = 28;
      base.h = 16;
      base.ownSpeed = 0.42;
      base.x = c + (Math.random() < 0.5 ? -1 : 1) * (w / 4);
      base.target = c + (Math.random() - 0.5) * (w / 2);
      base.vx = base.target > base.x ? 34 : -34;
    } else if (type === "rival") {
      base.w = 14;
      base.h = 22;
      base.ownSpeed = 0.72;
    }
    entities.push(base);
  }

  function spawnFuel() {
    const worldY = distance + VIEW_H + 24;
    const w = widthAt(worldY);
    const c = centerAt(worldY);
    entities.push({
      type: "fuel",
      x: c + (Math.random() - 0.5) * (w - 36),
      worldY,
      w: 12,
      h: 14,
      vx: 0,
      ownSpeed: 0,
      seed: Math.random() * 100,
      travelled: 0,
      target: 0,
      locked: false,
      scored: false,
      hit: false,
    });
  }

  function crash() {
    if (invuln > 0) return;
    hearts -= 1;
    invuln = 1.4;
    shake = 0.35;
    speed *= 0.35;
    banner = "CRASH";
    bannerTimer = 0.9;
    if (hearts <= 0) endRun(false, "OUT OF HEARTS");
  }

  function makeResult(won: boolean): SnapieResult {
    const replayToken = encodeReplay();
    return {
      gameId: SNAPIE_RUSH_GAME_ID,
      gameVersion: SNAPIE_RUSH_GAME_VERSION,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.playerName ? { playerName: options.playerName } : {}),
      score: Math.floor(score),
      stage: stageIndex + 1,
      stagesCleared,
      won,
      durationMs: Math.round(performance.now() - runStart),
      endedAt: Date.now(),
      ...(replayToken ? { replayToken } : {}),
    };
  }

  function encodeReplay() {
    try {
      const json = JSON.stringify({ v: 1, log: inputLog });
      if (typeof btoa === "undefined") return undefined;
      return btoa(unescape(encodeURIComponent(json)));
    } catch {
      return undefined;
    }
  }

  function persist() {
    if (typeof localStorage === "undefined") return;
    try {
      if (score > bestScore()) localStorage.setItem(BEST_STORAGE_KEY, String(Math.floor(score)));
      if (score >= BONUS_UNLOCK_SCORE) localStorage.setItem(BONUS_STORAGE_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  }

  function endRun(won: boolean, label: string) {
    phase = won ? "win" : "game-over";
    banner = label;
    bannerTimer = 3;
    persist();
    const result = makeResult(won);
    emit(won ? { type: "win", result } : { type: "game-over", result });
    options.onResult?.(result);
    pushHud();
  }

  function clearStage() {
    stagesCleared += 1;
    score += 1500 + speedTier() * 250;
    emit({ type: "stage-clear", stage: stageIndex + 1, score: Math.floor(score) });
    if (stageIndex >= routes.length - 1) {
      endRun(true, "ROUTE COMPLETE");
      return;
    }
    stageIndex += 1;
    banner = route().name.toUpperCase();
    bannerTimer = 2;
    resetStage();
    pushHud();
  }

  function step(dt: number) {
    if (phase !== "running") return;
    elapsed += dt;
    const r = route();
    const progress = clamp(distance / r.length, 0, 1);

    // --- steering -------------------------------------------------------
    const dir = input.left === input.right ? 0 : input.left ? -1 : 1;
    const thr = input.accel === input.brake ? 0 : input.accel ? 1 : -1;
    const code = dir + thr * 10;
    if (code !== lastDir) {
      inputLog.push([Math.round(elapsed * 1000), code]);
      lastDir = code;
    }
    if (spin > 0) {
      spin -= dt;
      bikeVX = Math.sin(elapsed * 22) * 150;
    } else {
      bikeVX = lerp(bikeVX, dir * STEER_SPEED * (0.7 + speedRatio() * 0.5), 1 - Math.pow(0.001, dt));
    }
    bikeX += bikeVX * dt;

    // --- road bounds ----------------------------------------------------
    const wy = bikeWorldY();
    const roadW = widthAt(wy);
    const center = centerAt(wy);
    const left = center - roadW / 2;
    const right = center + roadW / 2;
    const offroad = bikeX < left + BIKE_W / 2 || bikeX > right - BIKE_W / 2;

    const barrierL = left - 13;
    const barrierR = right + 13;
    if (bikeX < barrierL || bikeX > barrierR) {
      bikeX = clamp(bikeX, barrierL, barrierR);
      bikeVX = -bikeVX * 0.3;
      if (speedRatio() > 0.5) crash();
    }

    // --- speed ----------------------------------------------------------
    const throttleMul = thr > 0 ? 1.3 : thr < 0 ? 0.55 : 1;
    const target =
      lerp(r.baseSpeed, r.finishSpeed, progress) * (offroad ? 0.55 : 1) * throttleMul;
    // braking bites faster than the engine spools up
    speed = lerp(speed, target, 1 - Math.pow(thr < 0 ? 0.02 : 0.15, dt));
    const travelled = speed * dt;
    distance += travelled;
    score += (travelled / 10) * speedTier();

    // --- fuel -----------------------------------------------------------
    fuel -= (r.fuelBurn / 100) * dt * (0.7 + speedRatio() * 0.6);
    if (fuel <= 0) {
      fuel = 0;
      endRun(false, "OUT OF FUEL");
      return;
    }

    if (invuln > 0) invuln -= dt;
    if (shake > 0) shake -= dt;
    if (flash > 0) flash -= dt;
    if (bannerTimer > 0) bannerTimer -= dt;

    // --- spawning -------------------------------------------------------
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard();
      spawnTimer = spawnInterval();
    }
    fuelTimer -= dt;
    if (fuelTimer <= 0) {
      spawnFuel();
      fuelTimer = r.fuelInterval * (0.7 + Math.random() * 0.7);
    }

    // --- entities -------------------------------------------------------
    const bikeTop = wy + BIKE_H / 2;
    const bikeBottom = wy - BIKE_H / 2;
    for (const e of entities) {
      e.worldY += speed * e.ownSpeed * dt;
      if (e.type === "truck") {
        e.x += Math.sin(elapsed * 0.8 + e.seed) * 8 * dt;
      } else if (e.type === "swerver") {
        e.x += Math.cos(elapsed * 2.6 + e.seed) * 46 * dt;
      } else if (e.type === "drone" && !e.locked) {
        e.x += e.vx * dt;
        if ((e.vx > 0 && e.x >= e.target) || (e.vx < 0 && e.x <= e.target)) {
          e.x = e.target;
          e.locked = true;
        }
      } else if (e.type === "rival") {
        e.x += clamp(bikeX - e.x, -1, 1) * 26 * dt;
      }
      const ewy = e.worldY;
      const ew = widthAt(ewy);
      const ec = centerAt(ewy);
      e.x = clamp(e.x, ec - ew / 2 + e.w / 2, ec + ew / 2 - e.w / 2);

      // collision
      const overlapY = Math.abs(e.worldY - wy) < (e.h + BIKE_H) / 2;
      const dx = Math.abs(e.x - bikeX);
      const overlapX = dx < (e.w + BIKE_W) / 2;
      if (overlapY && overlapX && !e.hit) {
        if (e.type === "fuel") {
          e.hit = true;
          fuel = clamp(fuel + 0.28, 0, 1);
          score += 120;
          flash = 0.2;
        } else if (e.type === "oil") {
          e.hit = true;
          spin = 1.1;
          banner = "SPIN OUT";
          bannerTimer = 0.8;
        } else if (e.type === "rival") {
          e.hit = true;
          const bumpingBack = (dir === 1 && e.x > bikeX) || (dir === -1 && e.x < bikeX);
          if (bumpingBack) {
            score += 400;
            e.x += (e.x > bikeX ? 1 : -1) * 26;
            banner = "BUMP +400";
            bannerTimer = 0.8;
            flash = 0.15;
          } else {
            bikeX += (bikeX > e.x ? 1 : -1) * 18;
            shake = 0.2;
          }
          e.hit = false;
        } else {
          e.hit = true;
          crash();
          if (phase !== "running") return;
        }
      }

      // near miss
      if (
        !e.scored &&
        !e.hit &&
        e.type !== "fuel" &&
        e.type !== "oil" &&
        e.worldY + e.h / 2 < bikeBottom
      ) {
        e.scored = true;
        if (dx < (e.w + BIKE_W) / 2 + 9) {
          score += 60 * speedTier();
          flash = 0.12;
          banner = "NEAR MISS";
          bannerTimer = 0.5;
        }
      }
      void bikeTop;
    }
    entities = entities.filter((e) => e.worldY > distance - 40 && !(e.hit && e.type === "fuel"));

    if (distance >= r.length) {
      clearStage();
      return;
    }

    hudTick += dt;
    if (hudTick > 0.1) {
      hudTick = 0;
      pushHud();
    }
  }

  // ---------------------------------------------------------------- render
  function px(v: number) {
    return Math.round(v);
  }

  function rect(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(px(x), px(y), px(w), px(h));
  }

  /** Filled block with a 1px dark outline so sprites pop off the road. */
  function block(x: number, y: number, w: number, h: number, color: string, line = "#12131f") {
    rect(x - 1, y - 1, w + 2, h + 2, line);
    rect(x, y, w, h, color);
  }

  function shadow(x: number, y: number, w: number, h: number) {
    ctx.fillStyle = "rgba(12,13,25,0.35)";
    ctx.fillRect(px(x + 2), px(y + h - 2), px(w), 4);
  }

  function drawSnapie(x: number, y: number) {
    const flame = input.accel ? (Math.sin(elapsed * 42) > 0 ? 6 : 4) : 2;

    shadow(x - 8, y - 14, 16, 30);

    // exhaust flames (grow while accelerating)
    rect(x - 4, y + 13, 3, flame, "#ffcd75");
    rect(x + 1, y + 13, 3, flame, "#ffcd75");
    rect(x - 3, y + 13, 2, flame - 1, "#ef7d57");
    rect(x + 2, y + 13, 2, flame - 1, "#ef7d57");

    // wheels
    rect(x - 9, y - 11, 3, 5, "#12131f");
    rect(x + 6, y - 11, 3, 5, "#12131f");
    rect(x - 9, y + 6, 3, 5, "#12131f");
    rect(x + 6, y + 6, 3, 5, "#12131f");
    rect(x - 9, y - 10, 1, 3, "#3d4466");
    rect(x + 8, y - 10, 1, 3, "#3d4466");

    // nose / front bumper
    block(x - 5, y - 15, 10, 3, "#2bb8a5");
    // headlights
    rect(x - 5, y - 15, 2, 1, "#ffcd75");
    rect(x + 3, y - 15, 2, 1, "#ffcd75");

    // main body (teal sports car)
    block(x - 7, y - 12, 14, 25, "#41ead4");
    rect(x - 7, y + 8, 14, 5, "#2bb8a5");

    // Snapie face decal on the hood
    block(x - 4, y - 11, 8, 7, "#f4f4f4");
    // antennae
    rect(x - 2, y - 13, 1, 2, "#1a1c2c");
    rect(x + 1, y - 13, 1, 2, "#1a1c2c");
    rect(x - 2, y - 13, 1, 1, "#ef7d57");
    rect(x + 1, y - 13, 1, 1, "#ef7d57");
    // eyes
    rect(x - 3, y - 9, 2, 2, "#1a1c2c");
    rect(x + 1, y - 9, 2, 2, "#1a1c2c");
    // cheeks
    rect(x - 3, y - 6, 1, 1, "#ef7d57");
    rect(x + 2, y - 6, 1, 1, "#ef7d57");

    // windshield
    rect(x - 5, y - 3, 10, 3, "#1a1c2c");
    rect(x - 5, y - 3, 10, 1, "#3d4466");
    // roof
    rect(x - 6, y + 1, 12, 5, "#2bb8a5");
    rect(x - 6, y + 1, 12, 1, "#1f8a7b");
    // rear window
    rect(x - 5, y + 6, 10, 2, "#1a1c2c");
    // spoiler
    block(x - 8, y + 10, 16, 3, "#ef7d57");
    rect(x - 8, y + 10, 16, 1, "#ff9d76");
    // tail lights (bright while braking)
    const tail = input.brake ? "#ff2222" : "#c23a3a";
    rect(x - 6, y + 12, 3, 1, tail);
    rect(x + 3, y + 12, 3, 1, tail);
  }

  function drawEntity(e: Entity, y: number) {
    const x = e.x - e.w / 2;
    const top = y - e.h / 2;
    const w = e.w;
    const h = e.h;
    if (e.type !== "oil") shadow(x, top, w, h);

    switch (e.type) {
      case "truck": {
        block(x, top, w, h, "#8a8fb0");
        // cargo bay ridges
        rect(x + 2, top + 4, w - 4, h - 12, "#5d5f7a");
        for (let i = top + 6; i < top + h - 10; i += 4) rect(x + 3, i, w - 6, 1, "#71749a");
        // cab
        rect(x + 2, top + h - 9, w - 4, 6, "#c9ccdf");
        rect(x + 3, top + h - 8, w - 6, 3, "#1a1c2c");
        // tail lights
        rect(x + 1, top + h - 2, 3, 2, "#ffcd75");
        rect(x + w - 4, top + h - 2, 3, 2, "#ffcd75");
        break;
      }
      case "swerver": {
        block(x, top, w, h, "#ef7d57");
        rect(x + 1, top + 3, w - 2, h - 8, "#ff9d76");
        rect(x + 2, top + 5, w - 4, 6, "#1a1c2c");
        rect(x + 2, top + h - 6, w - 4, 3, "#1a1c2c");
        // wheels
        rect(x - 1, top + 3, 2, 5, "#1a1c2c");
        rect(x + w - 1, top + 3, 2, 5, "#1a1c2c");
        rect(x - 1, top + h - 8, 2, 5, "#1a1c2c");
        rect(x + w - 1, top + h - 8, 2, 5, "#1a1c2c");
        rect(x + 1, top + h - 2, 2, 2, "#ffcd75");
        rect(x + w - 3, top + h - 2, 2, 2, "#ffcd75");
        break;
      }
      case "oil": {
        // slick puddle with a shine so it reads as a hazard, not a hole
        rect(x + 2, top + 1, w - 4, h - 2, "#14151f");
        rect(x, top + 3, w, h - 6, "#14151f");
        rect(x + 3, top + 3, w - 8, 2, "#4b4a86");
        rect(x + 5, top + h - 6, 4, 2, "#3b3a6a");
        break;
      }
      case "drone": {
        const blink = Math.sin(elapsed * 18 + e.seed) > 0;
        // rotors
        rect(x - 2, top + h / 2 - 1, 5, 2, "#c9ccdf");
        rect(x + w - 3, top + h / 2 - 1, 5, 2, "#c9ccdf");
        block(x + 2, top + 2, w - 4, h - 4, "#a86edb");
        rect(x + 4, top + 4, w - 8, h - 8, "#d8b4f8");
        rect(x + w / 2 - 2, top + h / 2 - 2, 4, 4, e.locked || blink ? "#ef7d57" : "#41ead4");
        break;
      }
      case "rival": {
        // rival rider: dark bike, green shell, exhaust puff
        rect(x + w / 2 - 2, top + h, 4, 3, "rgba(56,183,100,0.5)");
        block(x, top, w, h, "#1a1c2c");
        rect(x + 1, top + 2, w - 2, h - 6, "#38b764");
        rect(x + 3, top + 3, w - 6, 5, "#f4f4f4");
        rect(x + 4, top + 4, w - 8, 3, "#1a1c2c");
        rect(x + 2, top + h - 3, w - 4, 2, "#ffcd75");
        break;
      }
      case "fuel": {
        const pulse = Math.sin(elapsed * 8 + e.seed) > 0 ? 1 : 0;
        ctx.fillStyle = "rgba(65,234,212,0.22)";
        ctx.fillRect(px(x - 3 - pulse), px(top - 3 - pulse), px(w + 6 + pulse * 2), px(h + 6 + pulse * 2));
        block(x, top, w, h, "#41ead4");
        rect(x + 2, top + 2, w - 4, h - 4, "#0f3c3a");
        rect(x + w / 2 - 1, top + 3, 2, h - 6, "#ffcd75");
        rect(x + w / 2 - 3, top + h / 2 - 1, 6, 2, "#ffcd75");
        break;
      }
    }
  }

  function drawText(text: string, x: number, y: number, color = "#f4f4f4") {
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(12,13,25,0.9)";
    ctx.fillText(text, px(x) + 1, px(y) + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, px(x), px(y));
  }

  /** NES-style splash: 3/4 front hero shot of Snapie's sports car on a showroom platform. */
  function drawSplash() {
    const t = (performance.now() / 1000) % 1000;

    // backdrop
    ctx.fillStyle = "#0e1430";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#141c40" : "#111838";
      ctx.fillRect(i * 13 - ((t * 6) % 26), 0, 7, 132);
    }
    // horizon glow
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(65,234,212,${(0.05 - i * 0.005).toFixed(3)})`;
      ctx.fillRect(0, 126 - i * 3, VIEW_W, 3);
    }
    // twinkling lights
    for (let i = 0; i < 26; i++) {
      const sx2 = (i * 71 + 19) % VIEW_W;
      const sy2 = (i * 37 + 11) % 110;
      const tw = Math.sin(t * 3 + i * 1.7) > 0 ? 0.7 : 0.2;
      ctx.fillStyle = i % 5 === 0 ? `rgba(255,205,117,${tw})` : `rgba(244,244,244,${tw})`;
      ctx.fillRect(sx2, sy2, 1, 1);
    }

    // showroom platform
    const plat = (w: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(px(VIEW_W / 2 - w / 2), px(y), px(w), 3);
    };
    plat(238, 132, "#1b2450");
    plat(228, 135, "#22305f");
    plat(214, 138, "#1b2450");
    plat(196, 141, "#161e42");
    plat(170, 144, "#121838");

    const u = 3;
    const cx = VIEW_W / 2;
    const cy = 68;
    const R = (x: number, y: number, w: number, h: number, color: string) =>
      rect(cx + x * u, cy + y * u, w * u, h * u, color);

    const BODY = "#41ead4";
    const BODY_D = "#2a9d8f";
    const BODY_L = "#8ef7e8";
    const DARK = "#0a0b14";
    const GLASS = "#1b2450";

    // ground shadow
    ctx.fillStyle = "rgba(6,7,12,0.55)";
    ctx.fillRect(px(cx - 19 * u), px(cy + 19.5 * u), 39 * u, 5);

    // ---- far side (receding to the right) ----
    R(10, 2, 11, 5, DARK); // rear cabin + quarter panel
    R(11, 3, 8, 3, GLASS); // side window
    R(10, 6, 12, 9, DARK); // side body block
    R(11, 7, 10, 7, BODY_D);
    R(11, 7, 10, 1, BODY_L); // shoulder highlight
    R(19, 7, 2, 7, "#1f7f74"); // rear shade
    R(12, 9.5, 3, 1, "#12131f"); // door line + racing number plate
    R(16, 9, 3, 3, "#f4f4f4");
    R(17, 9.5, 1, 2, "#ef7d57");
    R(14, 12, 7, 6, DARK); // rear wheel arch
    R(15, 13, 5, 5, "#12131f"); // rear tyre
    R(16, 14.5, 3, 2.5, "#3d4466"); // rim


    // ---- roof + cabin ----
    R(-9, 0, 20, 2, DARK);
    R(-8, 0.5, 18, 1, BODY_D);
    R(-11, 2, 24, 5, DARK); // windshield frame
    R(-9, 3, 20, 3, GLASS); // glass
    R(-9, 3, 20, 1, "#33447f"); // glass sheen

    // Snapie behind the windshield
    R(-3, 2.5, 6, 4, "#f4f4f4"); // helmet
    R(-3, 3.5, 6, 2, "#161e42"); // visor
    R(-2, 4, 1.5, 1, "#41ead4"); // eyes
    R(0.5, 4, 1.5, 1, "#41ead4");
    R(-2.5, 2, 1, 1, "#ef7d57"); // antennae tips
    R(1.5, 2, 1, 1, "#ef7d57");
    R(-4.5, 5, 1.5, 1, "#f4f4f4"); // hands on wheel
    R(3, 5, 1.5, 1, "#f4f4f4");

    // ---- hood ----
    R(-13, 7, 25, 4, DARK);
    R(-12, 7, 23, 3, BODY);
    R(-12, 7, 23, 1, BODY_L);
    R(-2, 7, 4, 3, "#12131f"); // hood stripe
    R(-1.25, 7, 1.5, 3, "#ef7d57");

    // ---- front fascia ----
    R(-15, 10, 30, 6, DARK);
    R(-14, 10.5, 28, 5, BODY);
    R(-14, 14, 28, 1.5, BODY_D);
    // headlights
    R(-13, 11, 5, 2, "#ffcd75");
    R(8, 11, 5, 2, "#ffcd75");
    R(-12.5, 11.25, 2, 1, "#fff6d0");
    R(9.5, 11.25, 2, 1, "#fff6d0");
    // grille + snapie face decal
    R(-5, 11.5, 10, 3, "#12131f");
    R(-3.5, 12, 2, 1, "#41ead4");
    R(1.5, 12, 2, 1, "#41ead4");
    R(-2, 13, 4, 0.5, "#41ead4");
    // bumper + splitter
    R(-16, 15.5, 32, 3, DARK);
    R(-15, 16, 30, 2, BODY_D);
    R(-14, 18, 28, 1.5, "#161e42");

    // ---- near-side front wheels ----
    R(-18.5, 11, 6, 9, DARK);
    R(-17.5, 12, 5, 7.5, "#12131f");
    R(-16.5, 14, 3, 3.5, "#3d4466");
    R(-15.75, 15, 1.5, 1.5, "#8a94c2");
    R(9.5, 13, 5, 6.5, DARK);
    R(10, 13.5, 4, 5.5, "#12131f");
    R(11, 15, 2, 2.5, "#3d4466");
    // fenders arching over the wheels
    R(-18.5, 10.5, 6, 1.5, DARK);
    R(-18, 11, 5, 1, BODY_D);
    R(9.5, 12.5, 5, 1.5, DARK);
    R(10, 13, 4, 1, BODY_D);


    // ---- spoiler over the rear deck ----
    R(11, 0.5, 11, 1.5, "#ef7d57");
    R(11, 0.5, 11, 0.5, "#ff9d76");
    R(12, 2, 1, 1.5, "#c2543a");
    R(19.5, 2, 1, 1.5, "#c2543a");

    // exhaust puffs behind the far side
    const fl = Math.sin(t * 22) > 0 ? 2 : 1;
    R(22, 13, 2, fl, "#ffcd75");
    R(24, 13.5, 1.5, fl, "#ef7d57");


    // light pool under the car
    ctx.fillStyle = "rgba(65,234,212,0.10)";
    ctx.fillRect(px(cx - 24 * u), px(cy + 29 * u), 48 * u, 3);
  }


  function render() {
    if (phase === "idle") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawSplash();
      return;
    }
    const t = route().theme;
    const sx = shake > 0 ? Math.round((Math.random() - 0.5) * 5) : 0;
    const sy = shake > 0 ? Math.round((Math.random() - 0.5) * 5) : 0;
    ctx.setTransform(1, 0, 0, 1, sx, sy);

    ctx.fillStyle = t.ground;
    ctx.fillRect(-6, -6, VIEW_W + 12, VIEW_H + 12);

    // ground texture bands scroll with the road so speed reads off-road too
    ctx.fillStyle = "rgba(12,13,25,0.10)";
    for (let wy = Math.floor(distance / 16) * 16; wy < distance + VIEW_H + 16; wy += 16) {
      const y = VIEW_H - (wy - distance);
      ctx.fillRect(0, px(y), VIEW_W, 8);
    }

    // road rows: tarmac, shoulder shading, rumble strips
    for (let y = 0; y < VIEW_H; y++) {
      const wy = distance + (VIEW_H - y);
      const w = widthAt(wy);
      const c = centerAt(wy);
      const l = Math.round(c - w / 2);
      const rw = Math.round(w);
      ctx.fillStyle = t.road;
      ctx.fillRect(l, y, rw, 1);
      // inner shoulder shading
      ctx.fillStyle = "rgba(12,13,25,0.18)";
      ctx.fillRect(l, y, 6, 1);
      ctx.fillRect(l + rw - 6, y, 6, 1);
      // rumble strips alternate along the route
      const stripe = Math.floor(wy / 10) % 2 === 0;
      ctx.fillStyle = stripe ? "#ef4f4f" : "#f4f4f4";
      ctx.fillRect(l - 4, y, 4, 1);
      ctx.fillRect(l + rw, y, 4, 1);
      ctx.fillStyle = t.roadEdge;
      ctx.fillRect(l - 6, y, 2, 1);
      ctx.fillRect(l + rw + 4, y, 2, 1);
    }

    // roadside parallax props
    const propStep = 46;
    const first = Math.floor((distance - 20) / propStep) * propStep;
    for (let wy = first; wy < distance + VIEW_H + 40; wy += propStep) {
      const y = VIEW_H - (wy - distance);
      const w = widthAt(wy);
      const c = centerAt(wy);
      const color = t.props[Math.abs(Math.floor(wy / propStep)) % t.props.length] as string;
      const h = t.propStyle === 0 ? 8 : t.propStyle === 1 ? 20 : 14;
      const pw = t.propStyle === 2 ? 6 : 9;
      const lx = c - w / 2 - 16 - pw;
      const rx = c + w / 2 + 16;
      shadow(lx, y - h, pw, h);
      shadow(rx, y - h, pw, h);
      block(lx, y - h, pw, h, color);
      block(rx, y - h, pw, h, color);
      // highlight face
      rect(lx + 1, y - h + 1, 2, h - 2, "rgba(244,244,244,0.25)");
      rect(rx + 1, y - h + 1, 2, h - 2, "rgba(244,244,244,0.25)");
    }

    // lane dashes
    const dashStep = 26;
    const firstDash = Math.floor(distance / dashStep) * dashStep;
    for (let wy = firstDash; wy < distance + VIEW_H + dashStep; wy += dashStep) {
      const y = VIEW_H - (wy - distance);
      const w = widthAt(wy);
      const c = centerAt(wy);
      for (const off of [-w / 6, w / 6]) {
        rect(c + off - 1, y - 12, 3, 12, "rgba(12,13,25,0.25)");
        rect(c + off, y - 12, 2, 12, t.lane);
      }
    }

    // finish band
    const finish = route().length;
    if (finish - distance < VIEW_H + 20) {
      const y = VIEW_H - (finish - distance);
      const w = widthAt(finish);
      const c = centerAt(finish);
      for (let i = 0; i < Math.round(w / 8); i++) {
        for (let row = 0; row < 2; row++) {
          ctx.fillStyle = (i + row) % 2 ? "#1a1c2c" : "#f4f4f4";
          ctx.fillRect(px(c - w / 2 + i * 8), px(y - 8 + row * 4), 8, 4);
        }
      }
    }

    // speed lines
    const lines = Math.round(speedRatio() * 10);
    ctx.fillStyle = "rgba(244,244,244,0.30)";
    for (let i = 0; i < lines; i++) {
      const lx = px((i * 71 + ((distance * 1.7) % 320)) % VIEW_W);
      const ly = px((i * 43 + ((distance * 3.1) % 192)) % VIEW_H);
      ctx.fillRect(lx, ly, 1, 8);
    }

    for (const e of entities) {
      const y = VIEW_H - (e.worldY - distance);
      if (y < -40 || y > VIEW_H + 40) continue;
      drawEntity(e, y);
    }

    if (!(invuln > 0 && Math.floor(elapsed * 14) % 2 === 0)) {
      drawSnapie(bikeX, BIKE_SCREEN_Y);
    }

    // depth fade at the top of the screen
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = `rgba(12,13,25,${(0.030 * (18 - i)).toFixed(3)})`;
      ctx.fillRect(0, i, VIEW_W, 1);
    }
    // vignette edges
    ctx.fillStyle = "rgba(12,13,25,0.18)";
    ctx.fillRect(0, 0, 4, VIEW_H);
    ctx.fillRect(VIEW_W - 4, 0, 4, VIEW_H);

    if (flash > 0) {
      ctx.fillStyle = "rgba(239,125,87,0.22)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (bannerTimer > 0 && banner) {
      ctx.fillStyle = "rgba(12,13,25,0.65)";
      ctx.fillRect(0, 24, VIEW_W, 16);
      drawText(banner, VIEW_W / 2, 36, "#ffcd75");
    }
    if (phase === "paused") {
      ctx.fillStyle = "rgba(26,28,44,0.7)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawText("PAUSED", VIEW_W / 2, VIEW_H / 2, "#f4f4f4");
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }


  function frame(now: number) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    if (phase !== "running") {
      if (shake > 0) shake -= dt;
      if (bannerTimer > 0) bannerTimer -= dt;
    }
    render();
  }

  raf = requestAnimationFrame(frame);
  emit({ type: "ready" });

  return {
    start(startStage = 0) {
      resetRun(startStage);
      phase = "running";
      runStart = performance.now();
      banner = route().name.toUpperCase();
      bannerTimer = 2;
      emit({
        type: "run-start",
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        startStage,
      });
      pushHud();
    },
    pause() {
      if (phase === "running") {
        phase = "paused";
        pushHud();
      }
    },
    resume() {
      if (phase === "paused") {
        phase = "running";
        pushHud();
      }
    },
    reset() {
      phase = "idle";
      resetRun(0);
      banner = "";
      pushHud();
    },
    setInput(next: { left: boolean; right: boolean; accel?: boolean; brake?: boolean }) {
      input = {
        left: next.left,
        right: next.right,
        accel: next.accel ?? false,
        brake: next.brake ?? false,
      };
    },
    getPhase: () => phase as string,
    getHud: () => hud(),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
    },
  };
}

export type SnapieRushEngine = ReturnType<typeof createEngine>;
