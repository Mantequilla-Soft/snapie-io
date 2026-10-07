// Snapie Jump engine: fixed-timestep physics, procedural platforms, camera, canvas rendering.
import { createAudio, type Sfx } from "./audio";
import {
  SNAPIE_JUMP_GAME_ID,
  SNAPIE_JUMP_GAME_VERSION,
  type SnapieEvent,
  type SnapieJumpHud,
  type SnapieJumpPhase,
  type SnapieJumpResult,
} from "../types";

export const WORLD_W = 400;
const GRAVITY = 1800;
const JUMP_V = 900; // apex = v²/2g = 225 units
const SUPER_V = 1300;
const SPRING_V = 1550;
const MAX_SAFE_GAP = 160; // well under the 225 apex => always reachable
const MAX_VX = 380;
const ACCEL = 2600;
const UNITS_PER_M = 10;
const BEST_KEY = "snapie-jump:best-score";
const STEP = 1 / 120;

type PType = "honeycomb" | "cyber" | "wax";
type Platform = { x: number; y: number; w: number; type: PType; vx: number; minX: number; maxX: number; broken: boolean; fallV: number; pulse: number; spring: boolean };
type Honey = { x: number; y: number; big: boolean; phase: number };
type PowerKind = "super" | "magnet" | "shield";
type Power = { x: number; y: number; kind: PowerKind; phase: number };
type Hazard = { kind: "wasp" | "zap"; x: number; y: number; vx: number; w: number; t: number; dead: boolean; deadV: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number };
type FloatText = { x: number; y: number; text: string; life: number; color: string };

export type EngineOptions = {
  playerName?: string;
  sessionId?: string;
  onEvent?: (e: SnapieEvent) => void;
  onResult?: (r: SnapieJumpResult) => void;
};

export type SnapieJumpEngine = ReturnType<typeof createEngine>;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

// Sky palette keyed by height (m): farm -> sky -> cyber -> space
const ZONES: { h: number; top: [number, number, number]; bot: [number, number, number] }[] = [
  { h: 0, top: [255, 214, 120], bot: [255, 241, 200] },
  { h: 250, top: [110, 190, 255], bot: [200, 235, 255] },
  { h: 700, top: [40, 40, 120], bot: [40, 150, 200] },
  { h: 1300, top: [10, 6, 30], bot: [50, 20, 90] },
];

function skyAt(h: number) {
  let i = 0;
  while (i < ZONES.length - 1 && h > ZONES[i + 1]!.h) i++;
  const a = ZONES[i]!;
  const b = ZONES[Math.min(i + 1, ZONES.length - 1)]!;
  const t = a === b ? 0 : clamp((h - a.h) / (b.h - a.h), 0, 1);
  const mix = (x: [number, number, number], y: [number, number, number]) =>
    `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`;
  return { top: mix(a.top, b.top), bot: mix(a.bot, b.bot) };
}

export function createEngine(canvas: HTMLCanvasElement, options: EngineOptions) {
  const ctx = canvas.getContext("2d")!;
  const audio = createAudio();
  let viewH = 700;
  let scale = 1;
  let dpr = 1;

  let phase: SnapieJumpPhase = "idle";
  let raf = 0;
  let last = 0;
  let acc = 0;
  let time = 0;
  let best = readBest();

  // run state
  const player = { x: WORLD_W / 2, y: 0, vx: 0, vy: 0, squash: 0, face: 1, wing: 0 };
  let platforms: Platform[] = [];
  let honey: Honey[] = [];
  let powers: Power[] = [];
  let hazards: Hazard[] = [];
  let particles: Particle[] = [];
  let texts: FloatText[] = [];
  let camY = 0;
  let startY = 0;
  let maxClimb = 0;
  let honeyCount = 0;
  let bonus = 0;
  let nextGenY = 0;
  let lastHazardY = 0;
  let superT = 0;
  let magnetT = 0;
  let shield = false;
  let shake = 0;
  let milestone = 0;
  let dyingT = 0;
  let runStart = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  let flash = 0;
  let lastHudAt = 0;

  const input = { left: false, right: false, pointerTarget: null as number | null };

  const emit = (e: SnapieEvent) => options.onEvent?.(e);
  const sfx = (s: Sfx) => audio.play(s);
  const heightM = () => Math.floor(maxClimb / UNITS_PER_M);
  const score = () => heightM() * 10 + bonus;

  function hud(): SnapieJumpHud {
    return { height: heightM(), score: score(), honey: honeyCount, best, phase, superJump: superT, magnet: magnetT, shield };
  }

  // ---------- generation ----------
  const difficulty = () => clamp(heightM() / 1400, 0, 1);

  function addPlatform(y: number, w: number, type: PType, d: number): Platform {
    const x = rand(0, WORLD_W - w);
    const p: Platform = { x, y, w, type, vx: 0, minX: 0, maxX: WORLD_W - w, broken: false, fallV: 0, pulse: 0, spring: false };
    if (type === "cyber") {
      p.vx = (Math.random() < 0.5 ? -1 : 1) * rand(40, 70 + 110 * d);
      const range = rand(80, 220);
      p.minX = clamp(x - range / 2, 0, WORLD_W - w);
      p.maxX = clamp(x + range / 2, 0, WORLD_W - w);
    }
    platforms.push(p);
    return p;
  }

  function genUntil(targetY: number) {
    while (nextGenY > targetY) {
      const h = (startY - nextGenY) / UNITS_PER_M;
      const d = difficulty();
      const extreme = clamp((h - 1400) / 1500, 0, 1); // "ridiculous" stretch
      const gap = Math.min(MAX_SAFE_GAP, lerp(48, 135, d) + rand(0, 18 * d) + extreme * 15);
      const prevY = nextGenY;
      nextGenY -= gap;
      const w = Math.max(44, lerp(100, 56, d) - extreme * 8 + rand(-6, 6));
      const moving = h > 60 && Math.random() < 0.08 + 0.4 * d + extreme * 0.2;
      // the guaranteed "path" platform is never wax, so the climb is always possible
      const p = addPlatform(nextGenY, w, moving ? "cyber" : "honeycomb", d);

      if (h > 30 && !moving && Math.random() < 0.05) p.spring = true;

      // wax decoys crumble after one bounce
      if (h > 70 && Math.random() < 0.18 + 0.25 * d) addPlatform(prevY - gap / 2, Math.max(44, w), "wax", d);
      // extra easy platforms early on
      if (h < 40 && Math.random() < 0.5) addPlatform(nextGenY + gap / 2, 90, "honeycomb", 0);

      // honey
      const r = Math.random();
      if (r < 0.04 && h > 40) honey.push({ x: rand(30, WORLD_W - 30), y: nextGenY - 60, big: true, phase: rand(0, 6) });
      else if (r < 0.32) honey.push({ x: p.x + p.w / 2, y: nextGenY - 35, big: false, phase: rand(0, 6) });
      else if (r < 0.4) {
        const cx = rand(60, WORLD_W - 60);
        for (let i = 0; i < 4; i++) honey.push({ x: cx + (i - 1.5) * 26, y: nextGenY - 70 - Math.abs(i - 1.5) * -8, big: false, phase: i });
      }
      // power-ups (rare)
      if (h > 50 && Math.random() < 0.022) {
        const kinds: PowerKind[] = ["super", "magnet", "shield"];
        powers.push({ x: p.x + p.w / 2, y: nextGenY - 40, kind: kinds[Math.floor(Math.random() * 3)]!, phase: 0 });
      }
      // hazards after a reasonable height, spaced so you're never sandwiched
      const hazardGap = lerp(900, 380, d) - extreme * 120;
      if (h > 180 && lastHazardY - nextGenY > hazardGap && Math.random() < 0.25 + 0.4 * d) {
        lastHazardY = nextGenY;
        const hy = nextGenY + gap / 2;
        if (h > 450 && Math.random() < 0.4) {
          hazards.push({ kind: "zap", x: rand(0, WORLD_W - 110), y: hy, vx: rand(40, 90 + 80 * d) * (Math.random() < 0.5 ? -1 : 1), w: rand(80, 120), t: 0, dead: false, deadV: 0 });
        } else {
          hazards.push({ kind: "wasp", x: rand(40, WORLD_W - 40), y: hy, vx: rand(50, 90 + 90 * d) * (Math.random() < 0.5 ? -1 : 1), w: 34, t: rand(0, 6), dead: false, deadV: 0 });
        }
      }
    }
  }

  function resetRun() {
    platforms = [];
    honey = [];
    powers = [];
    hazards = [];
    particles = [];
    texts = [];
    startY = 0;
    camY = -viewH + 120;
    // wide floor platform
    platforms.push({ x: WORLD_W / 2 - 80, y: 0, w: 160, type: "honeycomb", vx: 0, minX: 0, maxX: 0, broken: false, fallV: 0, pulse: 0, spring: false });
    player.x = WORLD_W / 2;
    player.y = -1;
    player.vx = 0;
    player.vy = -JUMP_V;
    player.squash = 0;
    nextGenY = 0;
    lastHazardY = 0;
    maxClimb = 0;
    honeyCount = 0;
    bonus = 0;
    superT = 0;
    magnetT = 0;
    shield = false;
    shake = 0;
    milestone = 0;
    dyingT = 0;
    flash = 0;
    pausedTotal = 0;
    genUntil(camY - viewH);
  }

  // ---------- effects ----------
  function burst(x: number, y: number, n: number, colors: string[], speed = 200, g = 400) {
    for (let i = 0; i < n; i++) {
      if (particles.length > 260) particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = rand(speed * 0.3, speed);
      const max = rand(0.4, 0.9);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color: colors[i % colors.length]!, size: rand(2, 5), g });
    }
  }
  const say = (x: number, y: number, text: string, color = "#fff") => texts.push({ x, y, text, life: 1, color });

  // ---------- update ----------
  function bounce(v: number) {
    player.vy = -v;
    player.squash = 1;
  }

  function update(dt: number) {
    time += dt;
    if (phase === "dying") {
      dyingT += dt;
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      player.wing += dt * 10;
      updateParticles(dt);
      if (dyingT > 1.1) finish();
      return;
    }
    if (phase !== "running") return;

    // horizontal: velocity steering
    let target = 0;
    if (input.pointerTarget !== null) {
      let dx = input.pointerTarget - player.x;
      if (dx > WORLD_W / 2) dx -= WORLD_W;
      if (dx < -WORLD_W / 2) dx += WORLD_W;
      target = clamp(dx * 7, -MAX_VX, MAX_VX);
      if (Math.abs(dx) < 2) target = 0;
    } else {
      target = (input.right ? MAX_VX : 0) - (input.left ? MAX_VX : 0);
    }
    const a = target === 0 ? ACCEL * 1.2 : ACCEL;
    if (player.vx < target) player.vx = Math.min(target, player.vx + a * dt);
    else player.vx = Math.max(target, player.vx - a * dt);
    if (Math.abs(player.vx) > 20) player.face = Math.sign(player.vx);
    player.x += player.vx * dt;
    if (player.x < 0) player.x += WORLD_W;
    if (player.x >= WORLD_W) player.x -= WORLD_W;

    // vertical with swept collision (no tunneling)
    const prevY = player.y;
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    player.squash = Math.max(0, player.squash - dt * 5);
    player.wing += dt * (player.vy < 0 ? 40 : 18);

    for (const p of platforms) {
      if (p.type === "cyber") {
        p.x += p.vx * dt;
        if (p.x < p.minX) { p.x = p.minX; p.vx = Math.abs(p.vx); }
        if (p.x > p.maxX) { p.x = p.maxX; p.vx = -Math.abs(p.vx); }
      }
      if (p.broken) { p.fallV += GRAVITY * dt; p.y += p.fallV * dt; }
      p.pulse = Math.max(0, p.pulse - dt * 4);
      if (p.broken || player.vy <= 0) continue;
      if (prevY <= p.y && player.y >= p.y && overlapX(player.x, 16, p.x, p.w)) {
        player.y = p.y;
        p.pulse = 1;
        if (p.spring) {
          bounce(SPRING_V);
          sfx("power");
          burst(player.x, p.y, 12, ["#ffd23f", "#fff"], 220);
        } else {
          bounce(superT > 0 ? SUPER_V : JUMP_V);
          sfx("bounce");
        }
        burst(player.x, p.y, 5, ["#fff6d5", "#ffd23f"], 90, 200);
        if (p.type === "wax") {
          p.broken = true;
          sfx("break");
          burst(p.x + p.w / 2, p.y, 10, ["#f6e7b4", "#d9b96a"], 150);
        }
        break;
      }
    }

    // timers
    superT = Math.max(0, superT - dt);
    magnetT = Math.max(0, magnetT - dt);
    shake = Math.max(0, shake - dt * 3);
    flash = Math.max(0, flash - dt * 2);

    // honey
    for (let i = honey.length - 1; i >= 0; i--) {
      const h = honey[i]!;
      h.phase += dt * 3;
      if (magnetT > 0) {
        const dx = player.x - h.x, dy = player.y - 14 - h.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 220) { h.x += (dx / dist) * 520 * dt; h.y += (dy / dist) * 520 * dt; }
      }
      const r = h.big ? 22 : 14;
      if (Math.hypot(player.x - h.x, player.y - 14 - h.y) < r + 14) {
        honey.splice(i, 1);
        honeyCount++;
        const pts = h.big ? 250 : 25;
        bonus += pts;
        sfx(h.big ? "big" : "honey");
        burst(h.x, h.y, h.big ? 22 : 8, ["#ffb800", "#ffd23f", "#fff2b0"], h.big ? 260 : 150, 150);
        say(h.x, h.y - 10, `+${pts}`, h.big ? "#fff2b0" : "#ffd23f");
        if (h.big) shake = 0.5;
      }
    }

    // power-ups
    for (let i = powers.length - 1; i >= 0; i--) {
      const pw = powers[i]!;
      pw.phase += dt * 3;
      if (Math.hypot(player.x - pw.x, player.y - 14 - pw.y) < 32) {
        powers.splice(i, 1);
        sfx("power");
        flash = 0.6;
        const col = pw.kind === "super" ? "#ff5fa2" : pw.kind === "magnet" ? "#ff4d4d" : "#4de1ff";
        burst(pw.x, pw.y, 24, [col, "#fff"], 260, 100);
        if (pw.kind === "super") { superT = 7; say(pw.x, pw.y, "SUPER JUMP!", col); bounce(SUPER_V); }
        if (pw.kind === "magnet") { magnetT = 9; say(pw.x, pw.y, "MAGNET!", col); }
        if (pw.kind === "shield") { shield = true; say(pw.x, pw.y, "SHIELD!", col); }
      }
    }

    // hazards
    for (const hz of hazards) {
      hz.t += dt;
      if (hz.dead) { hz.deadV += GRAVITY * dt; hz.y += hz.deadV * dt; continue; }
      hz.x += hz.vx * dt;
      const w = hz.kind === "wasp" ? 20 : hz.w;
      if (hz.kind === "wasp") {
        if (hz.x < 20 || hz.x > WORLD_W - 20) hz.vx *= -1;
        hz.x = clamp(hz.x, 20, WORLD_W - 20);
        const hy = hz.y + Math.sin(hz.t * 3) * 10;
        const dx = Math.abs(player.x - hz.x), dy = player.y - 14 - hy;
        if (dx < 26 && Math.abs(dy) < 26) {
          if (player.vy > 0 && dy < -6) {
            hz.dead = true;
            hz.deadV = -200;
            bounce(JUMP_V);
            bonus += 100;
            sfx("stomp");
            say(hz.x, hy - 20, "+100 STOMP", "#fff");
            burst(hz.x, hy, 14, ["#222", "#ffd23f"], 200);
          } else hurt();
        }
      } else {
        if (hz.x < 0 || hz.x + hz.w > WORLD_W) hz.vx *= -1;
        hz.x = clamp(hz.x, 0, WORLD_W - hz.w);
        const py = player.y - 14;
        if (Math.abs(py - hz.y) < 18 && player.x > hz.x - 10 && player.x < hz.x + w + 10) hurt();
      }
    }

    // camera follows upward only
    const anchor = camY + viewH * 0.42;
    if (player.y < anchor) camY = player.y - viewH * 0.42;
    const climb = startY - player.y;
    if (climb > maxClimb) maxClimb = climb;

    const m = Math.floor(heightM() / 100);
    if (m > milestone) {
      milestone = m;
      sfx("milestone");
      say(WORLD_W / 2, camY + viewH * 0.3, `${m * 100} m!`, "#fff");
      for (let i = 0; i < 4; i++) burst(rand(40, WORLD_W - 40), camY + rand(60, 200), 12, ["#ffd23f", "#4de1ff", "#ff5fa2", "#fff"], 220, 300);
      emit({ type: "stage-clear", stage: m, score: score() });
    }

    // fall check
    if (player.y > camY + viewH + 30) {
      if (shield) {
        shield = false;
        player.y = camY + viewH;
        bounce(SPRING_V);
        shake = 0.8;
        flash = 0.8;
        sfx("shield");
        say(player.x, camY + viewH - 80, "SAVED!", "#4de1ff");
        burst(player.x, camY + viewH - 20, 30, ["#4de1ff", "#fff"], 300, 100);
      } else die();
    }

    genUntil(camY - viewH);
    cull();
    updateParticles(dt);
  }

  function hurt() {
    if (shield) {
      shield = false;
      bounce(JUMP_V);
      shake = 0.6;
      sfx("shield");
      say(player.x, player.y - 40, "SHIELD POP!", "#4de1ff");
      burst(player.x, player.y - 14, 24, ["#4de1ff", "#fff"], 260, 100);
      // clear nearby hazards so the save is real
      for (const hz of hazards) if (Math.abs(hz.y - player.y) < 120) { hz.dead = true; hz.deadV = -100; }
      return;
    }
    player.vy = 200;
    die();
  }

  function die() {
    if (phase !== "running") return;
    phase = "dying";
    dyingT = 0;
    shake = 1;
    sfx("over");
    burst(player.x, Math.min(player.y, camY + viewH) - 14, 30, ["#3aa0ff", "#ffd23f", "#fff"], 280, 300);
    emitHud(true);
  }

  function overlapX(px: number, pr: number, x: number, w: number) {
    // honour wrap: test player and its ghost copies
    for (const o of [0, WORLD_W, -WORLD_W]) if (px + o + pr > x && px + o - pr < x + w) return true;
    return false;
  }

  function cull() {
    const limit = camY + viewH + 200;
    platforms = platforms.filter((p) => p.y < limit);
    honey = honey.filter((h) => h.y < limit);
    powers = powers.filter((p) => p.y < limit);
    hazards = hazards.filter((h) => h.y < limit);
    texts = texts.filter((t) => t.life > 0);
  }

  function updateParticles(dt: number) {
    for (const p of particles) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const t of texts) { t.life -= dt * 0.9; t.y -= 40 * dt; }
  }

  function finish() {
    phase = "game-over";
    const s = score();
    const isNewBest = s > best;
    if (isNewBest) {
      best = s;
      try { localStorage.setItem(BEST_KEY, String(s)); } catch { /* ignore */ }
    }
    const result: SnapieJumpResult = {
      gameId: SNAPIE_JUMP_GAME_ID,
      gameVersion: SNAPIE_JUMP_GAME_VERSION,
      sessionId: options.sessionId,
      playerName: options.playerName,
      score: s,
      // 1-based like the other Snapie games: the score API rejects stage < 1,
      // and a run under 100 m would otherwise report stage 0.
      stage: Math.floor(heightM() / 100) + 1,
      stagesCleared: milestone,
      won: false,
      durationMs: Math.round(performance.now() - runStart - pausedTotal),
      endedAt: Date.now(),
      meta: { height: heightM(), honey: honeyCount, isNewBest },
    };
    emitHud(true);
    emit({ type: "game-over", result });
    options.onResult?.(result);
  }

  // ---------- render ----------
  function render() {
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const h = (startY - camY - viewH * 0.5) / UNITS_PER_M;
    const sky = skyAt(Math.max(0, h));
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const s = scale * dpr;
    const sx = shake > 0 ? rand(-6, 6) * shake : 0;
    const sy = shake > 0 ? rand(-6, 6) * shake : 0;
    ctx.setTransform(s, 0, 0, s, sx * dpr, sy * dpr);

    drawBackdrop(h);
    ctx.translate(0, -camY);

    for (const p of platforms) drawPlatform(p);
    for (const hn of honey) drawHoney(hn);
    for (const pw of powers) drawPower(pw);
    for (const hz of hazards) drawHazard(hz);
    if (phase !== "idle") {
      drawSnapie(player.x, player.y);
      if (player.x < 30) drawSnapie(player.x + WORLD_W, player.y);
      if (player.x > WORLD_W - 30) drawSnapie(player.x - WORLD_W, player.y);
    }
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = "700 18px Fredoka, system-ui, sans-serif";
    for (const t of texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(40,20,0,0.6)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (flash > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackdrop(h: number) {
    // parallax layers in screen space
    const scroll = -camY;
    // ground hills & hives (fade out quickly)
    if (h < 120) {
      const base = viewH + (scroll * 0.4) - Math.max(0, -camY - viewH + 120) * 0;
      const off = (camY + viewH - 120) * -0.5;
      ctx.fillStyle = "#9bd36a";
      ctx.beginPath();
      ctx.moveTo(0, viewH + off);
      for (let x = 0; x <= WORLD_W; x += 20) ctx.lineTo(x, viewH - 60 + Math.sin(x / 50) * 18 + off);
      ctx.lineTo(WORLD_W, viewH + 400 + off);
      ctx.lineTo(0, viewH + 400 + off);
      ctx.fill();
      void base;
      // hive
      ctx.fillStyle = "#e7a52b";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(330, viewH - 100 + off + i * 14, 34 - Math.abs(i - 1.5) * 6, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // honeycomb hex pattern (subtle, all zones)
    const hexR = 26;
    const py = ((scroll * 0.15) % (hexR * 3)) - hexR * 3;
    ctx.strokeStyle = h > 700 ? "rgba(77,225,255,0.10)" : "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    for (let y = py; y < viewH + hexR * 3; y += hexR * 1.5) {
      const row = Math.round((y - py) / (hexR * 1.5));
      for (let x = (row % 2) * hexR * 0.87; x < WORLD_W + hexR; x += hexR * 1.74) hex(x, y, hexR);
    }
    // clouds
    if (h > 100 && h < 1100) {
      ctx.fillStyle = `rgba(255,255,255,${clamp((h - 100) / 200, 0, 0.7) * clamp((1100 - h) / 300, 0, 1)})`;
      for (let i = 0; i < 6; i++) {
        const cy = (((i * 173 + scroll * 0.3) % (viewH + 200)) + viewH + 200) % (viewH + 200) - 100;
        const cx = (i * 97) % WORLD_W;
        cloud(cx, cy, 30 + (i % 3) * 12);
      }
    }
    // stars
    if (h > 600) {
      const a = clamp((h - 600) / 500, 0, 1);
      for (let i = 0; i < 50; i++) {
        const y = (((i * 89 + scroll * 0.08) % viewH) + viewH) % viewH;
        const x = (i * 137.5) % WORLD_W;
        ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i)));
        ctx.fillStyle = i % 7 === 0 ? "#4de1ff" : "#fff";
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    // strange planet in space
    if (h > 1200) {
      ctx.globalAlpha = clamp((h - 1200) / 300, 0, 1);
      const pyy = 140 + (scroll * 0.02) % 40;
      ctx.fillStyle = "#ff5fa2";
      ctx.beginPath(); ctx.arc(80, pyy, 36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(80, pyy, 60, 12, -0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function hex(x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function cloud(x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y + 6, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r, y + 8, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlatform(p: Platform) {
    const dip = p.pulse * 5;
    const y = p.y + dip;
    const hgt = 14;
    if (p.type === "honeycomb") {
      ctx.fillStyle = "#a45f12";
      roundRect(p.x, y + 3, p.w, hgt, 7); ctx.fill();
      ctx.fillStyle = "#f5a623";
      roundRect(p.x, y, p.w, hgt, 7); ctx.fill();
      ctx.strokeStyle = "rgba(164,95,18,0.55)";
      ctx.lineWidth = 1.2;
      for (let x = p.x + 9; x < p.x + p.w - 4; x += 12) hex(x, y + 7, 5);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(p.x + 6, y + 2, p.w - 12, 2);
    } else if (p.type === "cyber") {
      ctx.fillStyle = "#123a5c";
      roundRect(p.x, y, p.w, hgt, 4); ctx.fill();
      ctx.fillStyle = "#4de1ff";
      ctx.fillRect(p.x + 4, y + 2, p.w - 8, 3);
      ctx.fillStyle = `rgba(77,225,255,${0.5 + 0.5 * Math.sin(time * 8)})`;
      ctx.fillRect(p.x + 4, y + hgt - 4, 6, 2);
      ctx.fillRect(p.x + p.w - 10, y + hgt - 4, 6, 2);
      ctx.fillStyle = "rgba(77,225,255,0.25)";
      ctx.fillRect(p.x + 8, y + hgt, p.w - 16, 4 + Math.sin(time * 10) * 1.5);
    } else {
      ctx.globalAlpha = p.broken ? clamp(1 - p.fallV / 900, 0, 1) : 1;
      ctx.fillStyle = "#f3e2a9";
      roundRect(p.x, y, p.w, hgt - 2, 5); ctx.fill();
      ctx.strokeStyle = "#c9a85a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x + p.w * 0.3, y); ctx.lineTo(p.x + p.w * 0.38, y + 6); ctx.lineTo(p.x + p.w * 0.32, y + 12);
      ctx.moveTo(p.x + p.w * 0.7, y); ctx.lineTo(p.x + p.w * 0.62, y + 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (p.spring) {
      const sy = y - 10 + (p.pulse > 0.5 ? -6 : 0);
      ctx.strokeStyle = "#555"; ctx.lineWidth = 2;
      ctx.beginPath();
      const cx = p.x + p.w / 2;
      ctx.moveTo(cx - 6, y); ctx.lineTo(cx + 6, y - 3); ctx.lineTo(cx - 6, y - 6); ctx.lineTo(cx + 6, sy + 2);
      ctx.stroke();
      ctx.fillStyle = "#ff5fa2";
      roundRect(cx - 10, sy - 3, 20, 5, 2); ctx.fill();
    }
  }

  function drawHoney(h: Honey) {
    const y = h.y + Math.sin(h.phase) * 4;
    const r = h.big ? 14 : 8;
    if (h.big) {
      ctx.fillStyle = `rgba(255,210,63,${0.25 + 0.15 * Math.sin(h.phase * 2)})`;
      ctx.beginPath(); ctx.arc(h.x, y, r * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ffb000";
    ctx.beginPath();
    ctx.moveTo(h.x, y - r * 1.5);
    ctx.bezierCurveTo(h.x + r, y - r * 0.3, h.x + r, y + r, h.x, y + r);
    ctx.bezierCurveTo(h.x - r, y + r, h.x - r, y - r * 0.3, h.x, y - r * 1.5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.arc(h.x - r * 0.35, y, r * 0.25, 0, Math.PI * 2); ctx.fill();
    if (h.big) {
      ctx.strokeStyle = "#fff2b0"; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function drawPower(pw: Power) {
    const y = pw.y + Math.sin(pw.phase) * 5;
    const col = pw.kind === "super" ? "#ff5fa2" : pw.kind === "magnet" ? "#ff4d4d" : "#4de1ff";
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(pw.phase * 2);
    ctx.beginPath(); ctx.arc(pw.x, y, 24, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(pw.x, y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    if (pw.kind === "super") {
      ctx.beginPath(); ctx.moveTo(pw.x, y - 10); ctx.lineTo(pw.x + 8, y); ctx.lineTo(pw.x + 3, y); ctx.lineTo(pw.x + 3, y + 9);
      ctx.lineTo(pw.x - 3, y + 9); ctx.lineTo(pw.x - 3, y); ctx.lineTo(pw.x - 8, y); ctx.closePath(); ctx.fill();
    } else if (pw.kind === "magnet") {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(pw.x, y - 1, 7, Math.PI, 0); ctx.lineTo(pw.x + 7, y + 7); ctx.moveTo(pw.x - 7, y - 1); ctx.lineTo(pw.x - 7, y + 7); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(pw.x, y - 10); ctx.lineTo(pw.x + 8, y - 6); ctx.lineTo(pw.x + 7, y + 3); ctx.lineTo(pw.x, y + 10);
      ctx.lineTo(pw.x - 7, y + 3); ctx.lineTo(pw.x - 8, y - 6); ctx.closePath(); ctx.fill();
    }
  }

  function drawHazard(hz: Hazard) {
    if (hz.kind === "wasp") {
      const y = hz.y + (hz.dead ? 0 : Math.sin(hz.t * 3) * 10);
      ctx.save();
      ctx.translate(hz.x, y);
      if (hz.dead) ctx.rotate(Math.PI);
      ctx.scale(hz.vx > 0 ? 1 : -1, 1);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      const f = Math.sin(hz.t * 50) * 4;
      ctx.beginPath(); ctx.ellipse(-2, -12 - f * 0.3, 8, 5 + f * 0.5, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffcc00";
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(-6, -10, 4, 20); ctx.fillRect(2, -10, 4, 20);
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-24, 3); ctx.lineTo(-15, 5); ctx.fill();
      ctx.fillStyle = "#ff3030";
      ctx.beginPath(); ctx.arc(11, -3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(14, -6); ctx.stroke();
      ctx.restore();
    } else {
      const y = hz.y;
      ctx.fillStyle = "#333";
      ctx.fillRect(hz.x - 6, y - 7, 10, 14);
      ctx.fillRect(hz.x + hz.w - 4, y - 7, 10, 14);
      ctx.strokeStyle = "#4de1ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#4de1ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(hz.x + 4, y);
      const segs = 8;
      for (let i = 1; i < segs; i++) ctx.lineTo(hz.x + 4 + ((hz.w - 8) * i) / segs, y + rand(-6, 6));
      ctx.lineTo(hz.x + hz.w - 4, y);
      ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawSnapie(x: number, y: number) {
    // squash on landing, stretch while rising fast
    const stretch = clamp(-player.vy / JUMP_V, -0.6, 1.4) * 0.12;
    const sq = player.squash * 0.28;
    const sxs = 1 + sq - stretch * 0.6;
    const sys = 1 - sq + stretch;
    ctx.save();
    ctx.translate(x, y);
    if (phase === "dying") ctx.rotate(dyingT * 8);
    ctx.scale(sxs * player.face, sys);
    ctx.translate(0, -18);

    if (shield) {
      ctx.strokeStyle = `rgba(77,225,255,${0.6 + 0.3 * Math.sin(time * 6)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(77,225,255,0.12)"; ctx.fill();
    }
    if (superT > 0) {
      ctx.fillStyle = `rgba(255,95,162,${0.35 + 0.2 * Math.sin(time * 20)})`;
      ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(0, 34 + Math.random() * 8); ctx.lineTo(8, 16); ctx.fill();
    }
    // wings
    const flap = Math.sin(player.wing) * 0.6;
    ctx.fillStyle = "rgba(220,245,255,0.85)";
    ctx.strokeStyle = "#7fd8ff"; ctx.lineWidth = 1.5;
    ctx.save(); ctx.rotate(-0.5 + flap); ctx.beginPath(); ctx.ellipse(-4, -22, 7, 13, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.rotate(0.2 - flap); ctx.beginPath(); ctx.ellipse(6, -21, 6, 11, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    // stinger
    ctx.fillStyle = "#123a5c";
    ctx.beginPath(); ctx.moveTo(-17, 2); ctx.lineTo(-25, 5); ctx.lineTo(-16, 8); ctx.fill();
    // body
    ctx.fillStyle = "#2f8cff";
    ctx.beginPath(); ctx.ellipse(0, 2, 18, 16, 0, 0, Math.PI * 2); ctx.fill();
    // cyber stripes
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 2, 18, 16, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#123a5c";
    ctx.fillRect(-12, -16, 5, 34);
    ctx.fillRect(-3, -16, 5, 34);
    ctx.fillStyle = "#4de1ff";
    ctx.fillRect(-12, 8, 5, 2);
    ctx.fillRect(-3, 12, 5, 2);
    ctx.restore();
    // belly shine
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.ellipse(8, -6, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill();
    // antennae
    ctx.strokeStyle = "#123a5c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, -12); ctx.quadraticCurveTo(10, -24, 16, -26); ctx.moveTo(12, -10); ctx.quadraticCurveTo(18, -20, 22, -20); ctx.stroke();
    ctx.fillStyle = "#4de1ff";
    ctx.beginPath(); ctx.arc(16, -26, 2.5, 0, Math.PI * 2); ctx.arc(22, -20, 2.5, 0, Math.PI * 2); ctx.fill();
    // visor/glasses (nerdy)
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(9, -1, 6, 0, Math.PI * 2); ctx.arc(-0.5, -1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#123a5c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(9, -1, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.5, -1, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3.5, -2); ctx.lineTo(4.5, -2); ctx.stroke();
    const look = phase === "dying" ? 0 : clamp(player.vy / 1500, -1, 1) * 1.5;
    ctx.fillStyle = "#0b1d33";
    if (phase === "dying") {
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(7, -3); ctx.lineTo(11, 1); ctx.moveTo(11, -3); ctx.lineTo(7, 1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(10.5, -1 + look, 2.6, 0, Math.PI * 2); ctx.arc(0.5, -1 + look, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // smile
    ctx.strokeStyle = "#0b1d33"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(8, 6, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }

  // ---------- loop ----------
  function emitHud(force = false) {
    const now = performance.now();
    if (!force && now - lastHudAt < 100) return;
    lastHudAt = now;
    emit({ type: "hud", hud: hud() });
  }

  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - last) / 1000 || 0);
    last = t;
    if (phase === "running" || phase === "dying") {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
      emitHud();
    } else if (phase === "idle") {
      time += dt;
    }
    render();
    if (phase === "idle") drawIdleSnapie();
  }

  function drawIdleSnapie() {
    // little bobbing mascot on the title screen
    const s = scale * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const y = viewH * 0.72 + Math.abs(Math.sin(time * 3)) * -50;
    player.vy = Math.cos(time * 3) * -600;
    player.wing += 0.6;
    ctx.translate(0, 0);
    drawSnapie(WORLD_W / 2, y);
  }

  function resize(cssW: number, cssH: number) {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    scale = cssW / WORLD_W;
    const oldH = viewH;
    viewH = cssH / scale;
    // keep player at the same relative screen spot
    camY += (oldH - viewH) * 0.42;
    if (phase === "running") genUntil(camY - viewH);
  }

  const onVisibility = () => {
    if (document.hidden && phase === "running") api.pause();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const api = {
    start() {
      audio.unlock();
      resetRun();
      phase = "running";
      runStart = performance.now();
      acc = 0;
      emit({ type: "run-start", sessionId: options.sessionId, startStage: 0 });
      emitHud(true);
    },
    pause() {
      if (phase !== "running") return;
      phase = "paused";
      pausedAt = performance.now();
      input.left = input.right = false;
      input.pointerTarget = null;
      emitHud(true);
    },
    resume() {
      if (phase !== "paused") return;
      pausedTotal += performance.now() - pausedAt;
      phase = "running";
      last = performance.now();
      acc = 0;
      emitHud(true);
    },
    reset() {
      resetRun();
      phase = "idle";
      emitHud(true);
    },
    setKeys(left: boolean, right: boolean) {
      input.left = left;
      input.right = right;
      if (left || right) input.pointerTarget = null;
    },
    /** World-x the player should steer toward, or null to release. */
    setPointerTarget(x: number | null) {
      input.pointerTarget = x === null ? null : ((x % WORLD_W) + WORLD_W) % WORLD_W;
    },
    getPlayerX: () => player.x,
    getScale: () => scale,
    setMuted: (m: boolean) => audio.setMuted(m),
    getPhase: () => phase,
    getHud: hud,
    resize,
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.destroy();
    },
  };

  resetRun();
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  emit({ type: "ready" });
  return api;
}
