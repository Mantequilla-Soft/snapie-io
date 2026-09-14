// Snapie Blast engine: fixed-timestep loop, spawning, hit detection, scoring, rendering.
// Framework-agnostic. Must not import app routes, styling, or any backend.

import { Sfx } from "./audio";
import { ARCHETYPES, RULES, bandForStage, type AlienKind, type WaveBand } from "./waves";

export const GAME_ID = "snapie-blast";
export const GAME_VERSION = "1.0.0";
export const VIEW_W = RULES.viewWidth;
export const VIEW_H = RULES.viewHeight;

export type Phase = "ready" | "playing" | "paused" | "over";

export type EngineHud = {
  score: number;
  multiplier: number;
  timeLeft: number;
  misses: number;
  maxMisses: number;
  stage: number;
  stageLabel: string;
  stageProgress: number;
  targets: number;
  hits: number;
  won: boolean;
};

export type EngineRunSummary = {
  score: number;
  stage: number;
  stagesCleared: number;
  won: boolean;
  durationMs: number;
  endedAt: number;
  replayToken?: string | undefined;
};

type Alien = {
  kind: AlienKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  points: number;
  born: number;
  phase: number;
  wobble: number;
  hurt: number;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; ttl: number; c: string };
type Shot = { x: number; y: number; life: number; hit: boolean };
type Float = { x: number; y: number; life: number; text: string };

export type EngineCallbacks = {
  onHud?: (hud: EngineHud) => void;
  onPhase?: (phase: Phase) => void;
  onStageClear?: (stage: number, score: number) => void;
  onGameOver?: (summary: EngineRunSummary) => void;
};

const PAL = {
  bg: "#1a1c2c",
  bgAlt: "#232640",
  light: "#f4f4f4",
  orange: "#ef7d57",
  green: "#38b764",
  cyan: "#73eff7",
  dark: "#0e0f1c",
  dim: "#5d5d81",
};

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export class BlastEngine {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly step = 1 / 60;
  private t = 0;
  private stars: Array<{ x: number; y: number; s: number }> = [];

  readonly sfx = new Sfx();

  phase: Phase = "ready";
  score = 0;
  hits = 0;
  misses = 0;
  stage = 1;
  stagesCleared = 0;
  killsInStage = 0;
  timeLeft = RULES.roundSeconds;
  won = false;

  private aliens: Alien[] = [];
  private particles: Particle[] = [];
  private shots: Shot[] = [];
  private floats: Float[] = [];
  private spawnCooldown = 0;
  private shake = 0;
  private startedAt = 0;
  private inputLog: Array<[number, number, number, 0 | 1]> = [];

  aim = { x: VIEW_W / 2, y: VIEW_H / 2 };
  showAim = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: EngineCallbacks = {},
  ) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d canvas context unavailable");
    this.ctx = c;
    this.ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 46; i++) {
      this.stars.push({
        x: Math.random() * VIEW_W,
        y: Math.random() * VIEW_H,
        s: Math.random() < 0.3 ? 2 : 1,
      });
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  get band(): WaveBand {
    return bandForStage(this.stage);
  }

  get multiplier(): number {
    return this.band.multiplier;
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.cb.onPhase?.(p);
  }

  hud(): EngineHud {
    return {
      score: this.score,
      multiplier: this.multiplier,
      timeLeft: Math.max(0, this.timeLeft),
      misses: this.misses,
      maxMisses: RULES.maxMisses,
      stage: this.stage,
      stageLabel: this.band.label,
      stageProgress: Math.min(1, this.killsInStage / this.band.quota),
      targets: this.aliens.length,
      hits: this.hits,
      won: this.won,
    };
  }

  private emitHud() {
    this.cb.onHud?.(this.hud());
  }

  start(startStage = 1) {
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.stage = Math.max(1, Math.floor(startStage));
    this.stagesCleared = 0;
    this.killsInStage = 0;
    this.timeLeft = RULES.roundSeconds;
    this.won = false;
    this.aliens = [];
    this.particles = [];
    this.shots = [];
    this.floats = [];
    this.spawnCooldown = 0;
    this.inputLog = [];
    this.startedAt = Date.now();
    this.sfx.resume();
    this.setPhase("playing");
    this.emitHud();
  }

  pause() {
    if (this.phase === "playing") this.setPhase("paused");
  }

  resume() {
    if (this.phase === "paused") this.setPhase("playing");
  }

  reset() {
    this.phase = "ready";
    this.aliens = [];
    this.particles = [];
    this.shots = [];
    this.floats = [];
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.stage = 1;
    this.stagesCleared = 0;
    this.killsInStage = 0;
    this.timeLeft = RULES.roundSeconds;
    this.won = false;
    this.setPhase("ready");
    this.emitHud();
  }

  run() {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      this.acc += dt;
      while (this.acc >= this.step) {
        this.update(this.step);
        this.acc -= this.step;
      }
      this.render();
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sfx.dispose();
  }

  // ---- input ---------------------------------------------------------------

  /** Fire at internal-resolution coordinates. */
  shoot(x: number, y: number) {
    this.sfx.resume();
    if (this.phase !== "playing") return;
    this.aim = { x, y };
    let hitIndex = -1;
    for (let i = this.aliens.length - 1; i >= 0; i--) {
      const a = this.aliens[i]!;
      const dx = x - a.x;
      const dy = y - a.y;
      if (dx * dx + dy * dy <= (a.r + 2) * (a.r + 2)) {
        hitIndex = i;
        break;
      }
    }
    this.inputLog.push([Math.round(this.t * 1000), Math.round(x), Math.round(y), hitIndex >= 0 ? 1 : 0]);
    this.sfx.laser();
    this.shots.push({ x, y, life: 0.14, hit: hitIndex >= 0 });

    if (hitIndex < 0) {
      this.registerMiss(x, y);
      return;
    }

    const a = this.aliens[hitIndex]!;
    a.hp -= 1;
    if (a.hp > 0) {
      a.hurt = 0.12;
      this.sfx.clank();
      this.burst(a.x, a.y, 6, PAL.cyan);
      return;
    }

    this.aliens.splice(hitIndex, 1);
    const gained = Math.round(a.points * this.multiplier);
    this.score += gained;
    this.hits += 1;
    this.killsInStage += 1;
    this.shake = 2;
    this.sfx.explosion();
    this.burst(a.x, a.y, 16, PAL.orange);
    this.floats.push({ x: a.x, y: a.y, life: 0.8, text: `+${gained}` });
    if (this.killsInStage >= this.band.quota) this.clearStage();
    this.emitHud();
  }

  moveAim(dx: number, dy: number) {
    this.showAim = true;
    this.aim.x = Math.max(2, Math.min(VIEW_W - 2, this.aim.x + dx));
    this.aim.y = Math.max(2, Math.min(VIEW_H - 2, this.aim.y + dy));
  }

  fireAtAim() {
    this.shoot(this.aim.x, this.aim.y);
  }

  // ---- simulation ----------------------------------------------------------

  private registerMiss(x: number, y: number) {
    this.misses += 1;
    this.sfx.miss();
    this.burst(x, y, 5, PAL.dim);
    this.floats.push({ x, y, life: 0.7, text: "MISS" });
    this.emitHud();
    if (this.misses >= RULES.maxMisses) this.endRun(false);
  }

  private clearStage() {
    this.stagesCleared += 1;
    this.stage += 1;
    this.killsInStage = 0;
    this.sfx.stageClear();
    this.cb.onStageClear?.(this.stage - 1, this.score);
  }

  private endRun(won: boolean) {
    if (this.phase === "over") return;
    this.won = won;
    this.setPhase("over");
    if (won) this.sfx.win();
    else this.sfx.gameOver();
    let replayToken: string | undefined;
    try {
      const raw = JSON.stringify({ v: 1, log: this.inputLog });
      replayToken =
        typeof btoa === "function" ? btoa(unescape(encodeURIComponent(raw))) : undefined;
    } catch {
      replayToken = undefined;
    }
    this.cb.onGameOver?.({
      score: this.score,
      stage: this.stage,
      stagesCleared: this.stagesCleared,
      won,
      durationMs: Date.now() - this.startedAt,
      endedAt: Date.now(),
      replayToken,
    });
    this.emitHud();
  }

  private spawn() {
    const band = this.band;
    const total = band.table.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * total;
    let kind: AlienKind = band.table[0]!.kind;
    for (const entry of band.table) {
      roll -= entry.weight;
      if (roll <= 0) {
        kind = entry.kind;
        break;
      }
    }
    const arch = ARCHETYPES[kind];
    const speed = arch.speed * band.speedScale;
    const fromLeft = Math.random() < 0.5;
    const dir = fromLeft ? 1 : -1;
    this.aliens.push({
      kind,
      x: fromLeft ? -arch.size : VIEW_W + arch.size,
      y: 26 + Math.random() * (VIEW_H - 56),
      vx: dir * speed,
      vy: kind === "shrinker" ? (Math.random() < 0.5 ? -1 : 1) * speed * 0.35 : 0,
      r: arch.size / 2,
      hp: arch.hp,
      points: arch.points,
      born: this.t,
      phase: Math.random() * Math.PI * 2,
      wobble: kind === "zigzag" ? 26 : 0,
      hurt: 0,
    });
  }

  private burst(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = 40 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.5 + Math.random() * 0.3,
        ttl: 0.8,
        c: Math.random() < 0.4 ? PAL.light : color,
      });
    }
  }

  private update(dt: number) {
    this.t += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 12);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.shots) s.life -= dt;
    this.shots = this.shots.filter((s) => s.life > 0);
    for (const f of this.floats) {
      f.y -= 14 * dt;
      f.life -= dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    if (this.phase !== "playing") return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endRun(true);
      return;
    }

    this.spawnCooldown -= dt;
    if (this.aliens.length < RULES.maxTargets && this.spawnCooldown <= 0) {
      this.spawn();
      this.spawnCooldown = 0.35;
    }

    for (const a of this.aliens) {
      a.x += a.vx * dt;
      if (a.wobble) {
        a.y += Math.sin((this.t + a.phase) * 5) * a.wobble * dt;
      } else {
        a.y += a.vy * dt;
      }
      if (a.y < 22 || a.y > VIEW_H - 20) a.vy *= -1;
      a.y = Math.max(22, Math.min(VIEW_H - 20, a.y));
      if (a.hurt > 0) a.hurt -= dt;
    }

    // Aliens that cross the screen escape: a score penalty, not a life.
    const escaped = this.aliens.filter((a) => a.x < -24 || a.x > VIEW_W + 24);
    if (escaped.length) {
      this.aliens = this.aliens.filter((a) => a.x >= -24 && a.x <= VIEW_W + 24);
      for (const e of escaped) {
        const penalty = Math.min(this.score, 5);
        this.score -= penalty;
        this.floats.push({
          x: Math.max(16, Math.min(VIEW_W - 16, e.x)),
          y: e.y,
          life: 0.7,
          text: "ESCAPED",
        });
      }
      this.emitHud();
    }

    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) this.emitHud();
  }

  // ---- rendering -----------------------------------------------------------

  private drawSnapie(x: number, y: number, scale = 1) {
    const ctx = this.ctx;
    const s = scale;
    const p = (dx: number, dy: number, w: number, h: number, c: string) =>
      px(ctx, x + dx * s, y + dy * s, w * s, h * s, c);
    const flap = Math.sin(this.t * 12) > 0 ? 0 : 1;
    // wings
    p(-9, -4 - flap, 7, 4, PAL.cyan);
    p(4, -4 - flap, 7, 4, PAL.cyan);
    // antennae
    p(-4, -11, 1, 4, PAL.dim);
    p(4, -11, 1, 4, PAL.dim);
    p(-5, -13, 2, 2, PAL.cyan);
    p(4, -13, 2, 2, PAL.cyan);
    // shell
    p(-6, -8, 12, 14, PAL.light);
    p(-6, -2, 12, 3, "#f7c34c");
    p(-6, 3, 12, 3, "#f7c34c");
    // visor
    p(-5, -7, 10, 5, PAL.dark);
    p(-3, -6, 2, 2, PAL.cyan);
    p(1, -6, 2, 2, PAL.cyan);
    // legs
    p(-4, 6, 2, 2, PAL.dim);
    p(2, 6, 2, 2, PAL.dim);
  }

  private drawAlien(a: Alien) {
    const arch = ARCHETYPES[a.kind];
    const body = a.hurt > 0 ? PAL.light : arch.body;
    const d = Math.round(a.r * 2);
    const x = Math.round(a.x - a.r);
    const y = Math.round(a.y - a.r);
    const bob = Math.round(Math.sin((this.t + a.phase) * 6) * 1);
    const ctx = this.ctx;

    if (a.kind === "armoured") {
      px(ctx, x - 1, y - 1 + bob, d + 2, d + 2, arch.shade);
      px(ctx, x + 1, y + 1 + bob, d - 2, d - 2, body);
      px(ctx, x + 2, y + 3 + bob, 3, 3, arch.eye);
      px(ctx, x + d - 5, y + 3 + bob, 3, 3, arch.eye);
      px(ctx, x + 3, y + d - 4 + bob, d - 6, 2, arch.shade);
      if (a.hp > 1) px(ctx, x - 1, y - 3 + bob, d + 2, 1, PAL.cyan);
      return;
    }

    // round-ish blob for the rest
    px(ctx, x + 1, y + bob, d - 2, d, body);
    px(ctx, x, y + 2 + bob, d, d - 4, body);
    px(ctx, x + 1, y + d - 3 + bob, d - 2, 2, arch.shade);
    const ex = Math.round(d / 4);
    px(ctx, x + ex, y + Math.round(d / 3) + bob, 2, 2, arch.eye);
    px(ctx, x + d - ex - 2, y + Math.round(d / 3) + bob, 2, 2, arch.eye);
    // tentacles
    const wig = Math.sin((this.t + a.phase) * 9) > 0 ? 0 : 1;
    px(ctx, x + 1, y + d + bob, 2, 2 - wig, arch.shade);
    px(ctx, x + d - 3, y + d + bob, 2, 1 + wig, arch.shade);
  }

  private drawScene() {
    const ctx = this.ctx;
    px(ctx, 0, 0, VIEW_W, VIEW_H, PAL.bg);
    // starfield
    for (const s of this.stars) {
      const tw = (Math.sin(this.t * 2 + s.x) + 1) / 2;
      px(ctx, s.x, s.y, s.s, s.s, tw > 0.6 ? PAL.light : PAL.dim);
    }
    // horizon hive silhouette
    for (let i = 0; i < 10; i++) {
      const h = 12 + ((i * 37) % 26);
      px(ctx, i * 32, VIEW_H - h - 8, 26, h, PAL.bgAlt);
    }
    px(ctx, 0, VIEW_H - 8, VIEW_W, 8, "#2b2f4f");
    for (let x = 0; x < VIEW_W; x += 8) px(ctx, x, VIEW_H - 8, 4, 1, PAL.dim);
  }

  private render() {
    const ctx = this.ctx;
    ctx.save();
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(sx, sy);

    this.drawScene();

    if (this.phase === "ready" || this.phase === "over") {
      this.drawSnapie(VIEW_W / 2, VIEW_H / 2 - 6, 1.6);
    }

    for (const a of this.aliens) this.drawAlien(a);

    for (const s of this.shots) {
      const c = s.hit ? PAL.orange : PAL.cyan;
      px(ctx, s.x - 6, s.y, 13, 1, c);
      px(ctx, s.x, s.y - 6, 1, 13, c);
      px(ctx, s.x - 1, s.y - 1, 3, 3, PAL.light);
    }

    for (const p of this.particles) {
      const size = p.life > 0.35 ? 2 : 1;
      px(ctx, p.x, p.y, size, size, p.c);
    }

    ctx.font = "6px monospace";
    ctx.textAlign = "center";
    for (const f of this.floats) {
      ctx.fillStyle = f.text === "+0" || f.text.startsWith("+") ? PAL.cyan : PAL.orange;
      ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
    }

    if (this.showAim && this.phase === "playing") {
      const { x, y } = this.aim;
      px(ctx, x - 5, y, 4, 1, PAL.light);
      px(ctx, x + 2, y, 4, 1, PAL.light);
      px(ctx, x, y - 5, 1, 4, PAL.light);
      px(ctx, x, y + 2, 1, 4, PAL.light);
    }

    ctx.restore();
  }
}
