import { LEVELS, type EnemyKind, type LevelDef } from "./levels";
import { Sfx } from "./audio";

export const TILE = 16;
export const VIEW_W = 320;
export const VIEW_H = 192;
export const MAIN_STAGE_COUNT = 4;
export const SECRET_UNLOCK_SCORE = 13000;

export type Power = "none" | "star" | "hover" | "fire" | "spike";

export type Hud = {
  hearts: number;
  score: number;
  stage: number;
  stageName: string;
  power: Power;
  mouthful: boolean;
};

export type EngineEvents = {
  onHud: (hud: Hud) => void;
  onStageClear: (stage: number, score: number) => void;
  onGameOver: (stage: number, score: number) => void;
  onWin: (stage: number, score: number) => void;
};

export type InputKey = "left" | "right" | "up" | "down" | "jump" | "action";

const COLORS = {
  ink: "#1a1c2c",
  paper: "#f4f4f4",
  orange: "#ef7d57",
  green: "#38b764",
  blue: "#41a6f6",
  pink: "#f6a5c0",
  purple: "#a06ad9",
  yellow: "#ffcd75",
  dirt: "#5b4a3a",
  grass: "#265c42",
  red: "#b13e53",
};

const CYAN = "#5cf2ff";
const CYAN_DIM = "#2b7fd4";

type Body = { x: number; y: number; w: number; h: number; vx: number; vy: number };

type Enemy = Body & {
  kind: EnemyKind;
  alive: boolean;
  dir: number;
  homeX: number;
  range: number;
  t: number;
  timer: number;
  spiky: boolean;
  captured: boolean;
};

type Shot = Body & { life: number; from: "hero" | "enemy"; kind: "star" | "fire" };

type Star = { x: number; y: number; taken: boolean };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function overlaps(a: Body, b: Body) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private events: EngineEvents;
  readonly sfx = new Sfx();

  private level!: LevelDef;
  private solid!: Uint8Array;
  private oneWay!: Uint8Array;
  private cols = 0;
  private rows = 0;

  private hero!: Body;
  private facing = 1;
  private onGround = false;
  private hearts = 3;
  private invuln = 0;
  private inhaling = false;
  private wasInhaling = false;
  private mouthful = false;
  private power: Power = "none";
  private dashTime = 0;
  private puffTime = 0;
  private hoverTime = 0;
  private attackCooldown = 0;
  private safeX = 0;
  private safeY = 0;

  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private stars: Star[] = [];
  private particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; c: string }> = [];

  private camX = 0;
  private camTarget = 0;

  private score = 0;
  private stageScore = 0;
  private stageIndex = 0;
  private stageTime = 0;
  private finished = false;
  private frame = 0;

  private keys: Record<InputKey, boolean> = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action: false,
  };
  private prevJump = false;
  private prevAction = false;
  private prevDown = false;
  private tapJump = false;
  private tapAction = false;
  private tapDown = false;


  constructor(canvas: HTMLCanvasElement, events: EngineEvents) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.events = events;
  }

  setKey(key: InputKey, down: boolean) {
    // latch quick taps so a press that starts and ends between two frames still counts
    if (down && !this.keys[key]) {
      if (key === "jump") this.tapJump = true;
      if (key === "action") this.tapAction = true;
      if (key === "down") this.tapDown = true;
    }
    this.keys[key] = down;
  }


  get totalScore() {
    return this.score;
  }

  startStage(index: number, carriedScore: number, hearts: number) {
    this.stageIndex = clamp(index, 0, LEVELS.length - 1);
    this.level = LEVELS[this.stageIndex]!;
    this.score = carriedScore;
    this.stageScore = 0;
    this.hearts = hearts;
    this.stageTime = 0;
    this.finished = false;
    this.buildTiles();

    this.hero = { x: 2 * TILE, y: 8 * TILE, w: 11, h: 12, vx: 0, vy: 0 };
    this.safeX = this.hero.x;
    this.safeY = this.hero.y;
    this.facing = 1;
    this.invuln = 0;
    this.mouthful = false;
    this.power = "none";
    this.dashTime = 0;
    this.puffTime = 0;
    this.hoverTime = 0;
    this.shots = [];
    this.particles = [];
    this.camX = 0;
    this.camTarget = 0;


    this.enemies = this.level.enemies.map((e) => ({
      kind: e.kind,
      x: e.x * TILE,
      y: e.y * TILE,
      w: e.kind === "blob" ? 14 : 12,
      h: e.kind === "blob" ? 13 : 12,
      vx: 0,
      vy: 0,
      alive: true,
      dir: -1,
      homeX: e.x * TILE,
      range: (e.range ?? 4) * TILE,
      t: Math.random() * 6,
      timer: 1 + Math.random(),
      spiky: false,
      captured: false,
    }));
    this.stars = this.level.stars.map(([x, y]) => ({ x: x * TILE, y: y * TILE, taken: false }));

    this.pushHud();
    this.resume();
  }

  private buildTiles() {
    this.cols = this.level.width;
    this.rows = this.level.height;
    this.solid = new Uint8Array(this.cols * this.rows);
    this.oneWay = new Uint8Array(this.cols * this.rows);
    for (const [x, y, w, h] of this.level.solids) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) this.solid[j * this.cols + i] = 1;
        }
      }
    }
    for (const [x, y, w, h] of this.level.platforms) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) this.oneWay[j * this.cols + i] = 1;
        }
      }
    }
  }

  private isSolid(col: number, row: number) {
    if (col < 0 || col >= this.cols) return true;
    if (row < 0) return false;
    if (row >= this.rows) return false;
    return this.solid[row * this.cols + col] === 1;
  }

  private isOneWay(col: number, row: number) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    return this.oneWay[row * this.cols + col] === 1;
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.pause();
    this.sfx.dispose();
  }

  private loop = (now: number) => {
    if (!this.running) return;
    // Variable timestep (clamped) so motion stays smooth on any refresh rate.
    // A fixed 60Hz step rendered on a 120Hz/variable display made the picture judder.
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private pushHud() {
    this.events.onHud({
      hearts: this.hearts,
      score: this.score + this.stageScore,
      stage: this.stageIndex + 1,
      stageName: this.level.name,
      power: this.power,
      mouthful: this.mouthful,
    });
  }

  private addScore(n: number) {
    this.stageScore += n;
    this.pushHud();
  }

  private burst(x: number, y: number, c: string, n = 8) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.7) * 90,
        life: 0.4 + Math.random() * 0.3,
        c,
      });
    }
  }

  // ---- physics -------------------------------------------------------

  private moveBody(b: Body, dx: number, dy: number, allowOneWay: boolean) {
    b.x += dx;
    const cols = [Math.floor(b.x / TILE), Math.floor((b.x + b.w - 1) / TILE)];
    const rowsSpan = [Math.floor(b.y / TILE), Math.floor((b.y + b.h - 1) / TILE)];
    for (let r = rowsSpan[0]!; r <= rowsSpan[1]!; r++) {
      for (const c of cols) {
        if (this.isSolid(c, r)) {
          if (dx > 0) b.x = c * TILE - b.w;
          else if (dx < 0) b.x = (c + 1) * TILE;
          b.vx = 0;
        }
      }
    }

    const prevBottom = b.y + b.h;
    b.y += dy;
    let grounded = false;
    const colsSpan = [Math.floor(b.x / TILE), Math.floor((b.x + b.w - 1) / TILE)];
    // Test the leading edge, including its exact boundary. Using `bottom - 1`
    // allowed a resting body to sink almost one pixel under gravity before the
    // next collision snapped it back, which made every grounded sprite jitter.
    const edgeRow = dy > 0 ? Math.floor((b.y + b.h) / TILE) : Math.floor(b.y / TILE);
    for (let c = colsSpan[0]!; c <= colsSpan[1]!; c++) {
      const hitSolid = this.isSolid(c, edgeRow);
      const hitOneWay =
        allowOneWay &&
        this.isOneWay(c, edgeRow) &&
        dy > 0 &&
        prevBottom <= edgeRow * TILE + 2 &&
        !this.keys.down;
      if (hitSolid || hitOneWay) {
        if (dy > 0) {
          b.y = edgeRow * TILE - b.h;
          grounded = true;
        } else if (dy < 0 && hitSolid) {
          b.y = (edgeRow + 1) * TILE;
        }
        b.vy = 0;
      }
    }
    return grounded;
  }

  // ---- update --------------------------------------------------------

  private update(dt: number) {
    if (this.finished) return;
    this.frame++;
    this.stageTime += dt;
    const speed = this.level.speed;

    const jumpPressed = (this.keys.jump && !this.prevJump) || this.tapJump;
    const actionPressed = (this.keys.action && !this.prevAction) || this.tapAction;
    const downPressed = (this.keys.down && !this.prevDown) || this.tapDown;
    this.tapJump = this.tapAction = this.tapDown = false;

    this.prevJump = this.keys.jump;
    this.prevAction = this.keys.action;
    this.prevDown = this.keys.down;

    if (this.invuln > 0) this.invuln -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // horizontal
    const accel = 700;
    const maxSpeed = this.dashTime > 0 ? 190 : this.inhaling ? 55 : 95;
    let dir = 0;
    if (this.keys.left) dir -= 1;
    if (this.keys.right) dir += 1;
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.hero.vx = this.facing * 190;
    } else {
      if (dir !== 0) {
        this.facing = dir;
        this.hero.vx += dir * accel * dt;
      } else {
        this.hero.vx *= 0.75;
        if (Math.abs(this.hero.vx) < 5) this.hero.vx = 0;

      }
      this.hero.vx = clamp(this.hero.vx, -maxSpeed, maxSpeed);
    }

    // jump / float
    if (jumpPressed && this.onGround) {
      this.hero.vy = -215;
      this.onGround = false;
      this.sfx.jump();
    } else if (jumpPressed && !this.onGround) {
      this.puffTime = this.power === "hover" ? 1.1 : 0.65;
      this.hero.vy = Math.min(this.hero.vy, -60);
    }
    if (this.hoverTime > 0) this.hoverTime -= dt;
    const hovering = this.hoverTime > 0 && !this.onGround;
    const floating = hovering || (this.puffTime > 0 && this.keys.jump && !this.onGround);
    if (this.puffTime > 0) this.puffTime -= dt;

    if (hovering) {
      // jetpack-style lift while the copied hover power is active
      this.hero.vy = this.keys.jump ? -105 : -55;
    }
    const gravity = floating ? 120 : 620;
    this.hero.vy += gravity * dt;
    const maxFall = floating ? 42 : 300;
    this.hero.vy = Math.min(this.hero.vy, maxFall);

    this.onGround = this.moveBody(this.hero, this.hero.vx * dt, this.hero.vy * dt, true);
    if (this.onGround) {
      const under = Math.floor((this.hero.y + this.hero.h + 2) / TILE);
      if (this.isSolid(Math.floor((this.hero.x + this.hero.w / 2) / TILE), under)) {
        this.safeX = this.hero.x;
        this.safeY = this.hero.y;
      }
    }
    this.hero.x = clamp(this.hero.x, 0, this.cols * TILE - this.hero.w);

    // action key
    this.inhaling = false;
    if (this.power !== "none") {
      if (actionPressed && this.attackCooldown <= 0) this.usePower();
      if (downPressed) {
        this.power = "none";
        this.pushHud();
      }
    } else if (this.mouthful) {
      if (actionPressed) this.spit();
      if (downPressed) this.swallow();
    } else if (this.keys.action) {
      this.inhaling = true;
    }
    if (this.inhaling && !this.wasInhaling) this.sfx.inhale();
    this.wasInhaling = this.inhaling;

    // pit death
    if (this.hero.y > this.rows * TILE + 24) {
      this.hurt(true);
    }

    this.updateEnemies(dt, speed);
    this.updateShots(dt);

    // stars
    for (const s of this.stars) {
      if (s.taken) continue;
      if (
        this.hero.x < s.x + 10 &&
        this.hero.x + this.hero.w > s.x &&
        this.hero.y < s.y + 10 &&
        this.hero.y + this.hero.h > s.y
      ) {
        s.taken = true;
        this.burst(s.x + 5, s.y + 5, COLORS.yellow, 6);
        this.addScore(50);
        this.sfx.pickup();
      }
    }

    // door
    const door = { x: this.level.door[0] * TILE, y: this.level.door[1] * TILE, w: 16, h: 32, vx: 0, vy: 0 };
    if (overlaps(this.hero, door)) this.clearStage();

    // particles
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // camera
    const target = clamp(this.hero.x + this.hero.w / 2 - VIEW_W / 2, 0, this.cols * TILE - VIEW_W);
    this.camTarget += (target - this.camTarget) * Math.min(1, dt * 6);
    // snap the camera to whole pixels so the pixel art never shimmers
    this.camX = Math.round(this.camTarget);

  }

  private usePower() {
    this.attackCooldown = 0.35;
    if (this.power === "star") {
      this.shots.push({
        x: this.hero.x + (this.facing > 0 ? this.hero.w : -6),
        y: this.hero.y + 4,
        w: 6,
        h: 6,
        vx: this.facing * 170,
        vy: 0,
        life: 1.4,
        from: "hero",
        kind: "star",
      });
      this.sfx.shoot();
    } else if (this.power === "fire") {
      for (let i = 0; i < 3; i++) {
        this.shots.push({
          x: this.hero.x + (this.facing > 0 ? this.hero.w : -6) + this.facing * i * 6,
          y: this.hero.y + 5 + (Math.random() - 0.5) * 4,
          w: 7,
          h: 7,
          vx: this.facing * (120 + i * 18),
          vy: 0,
          life: 0.45,
          from: "hero",
          kind: "fire",
        });
      }
      this.sfx.shoot();
    } else if (this.power === "spike") {
      this.dashTime = 0.34;
      this.attackCooldown = 0.6;
      this.sfx.powerUp();
    } else if (this.power === "hover") {
      // jet boost: rise for a while, hold JUMP to climb faster
      this.hoverTime = 1.6;
      this.puffTime = 1.6;
      this.attackCooldown = 0.2;
      this.onGround = false;
      this.hero.vy = -110;
      this.burst(this.hero.x + this.hero.w / 2, this.hero.y + this.hero.h, COLORS.blue, 6);
      this.sfx.powerUp();
    }
  }

  private spit() {
    this.mouthful = false;
    this.shots.push({
      x: this.hero.x + (this.facing > 0 ? this.hero.w : -8),
      y: this.hero.y + 3,
      w: 8,
      h: 8,
      vx: this.facing * 210,
      vy: 0,
      life: 1.2,
      from: "hero",
      kind: "star",
    });
    this.sfx.shoot();
    this.pushHud();
  }

  private swallow() {
    const captured = this.enemies.find((e) => e.captured);
    if (!captured) return;
    captured.alive = false;
    captured.captured = false;
    this.mouthful = false;
    this.power =
      captured.kind === "walker"
        ? "star"
        : captured.kind === "flyer"
          ? "hover"
          : captured.kind === "blob"
            ? "fire"
            : "spike";
    this.burst(this.hero.x + 6, this.hero.y + 6, COLORS.pink, 10);
    this.addScore(150);
    this.sfx.powerUp();
    this.pushHud();

  }

  private updateEnemies(dt: number, speed: number) {
    const mouthX = this.hero.x + this.facing * 72;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt;

      if (e.captured) {
        e.x += (this.hero.x - e.x) * Math.min(1, dt * 14);
        e.y += (this.hero.y - e.y) * Math.min(1, dt * 14);
        continue;
      }

      // inhale pull
      if (this.inhaling && !this.mouthful) {
        const inCone =
          Math.abs(e.y + e.h / 2 - (this.hero.y + this.hero.h / 2)) < 22 &&
          (this.facing > 0 ? e.x > this.hero.x && e.x < mouthX : e.x < this.hero.x && e.x > mouthX);
        const inhalable = !(e.kind === "spiker" && e.spiky);
        if (inCone && inhalable) {
          e.x += (this.hero.x - e.x) * Math.min(1, dt * 11);
          e.y += (this.hero.y - e.y) * Math.min(1, dt * 11);
          if (Math.abs(e.x - this.hero.x) < 14 && Math.abs(e.y - this.hero.y) < 14) {

            e.captured = true;
            this.mouthful = true;
            this.sfx.capture();
            this.pushHud();
            continue;
          }
        }
      }

      switch (e.kind) {
        case "walker": {
          e.vx = e.dir * 34 * speed;
          const ahead = Math.floor((e.x + (e.dir > 0 ? e.w + 2 : -2)) / TILE);
          const below = Math.floor((e.y + e.h + 2) / TILE);
          if (this.isSolid(ahead, Math.floor((e.y + e.h - 2) / TILE)) || !this.isSolid(ahead, below)) e.dir *= -1;
          if (Math.abs(e.x - e.homeX) > e.range) e.dir = e.x > e.homeX ? -1 : 1;
          e.vy += 620 * dt;
          this.moveBody(e, e.vx * dt, Math.min(e.vy, 300) * dt, false);
          break;
        }
        case "flyer": {
          e.vx = e.dir * 42 * speed;
          if (Math.abs(e.x - e.homeX) > e.range) e.dir = e.x > e.homeX ? -1 : 1;
          e.x += e.vx * dt;
          e.y += Math.sin(e.t * 2.6 * speed) * 34 * dt;
          break;
        }
        case "blob": {
          e.vy += 620 * dt;
          this.moveBody(e, 0, Math.min(e.vy, 300) * dt, false);
          e.timer -= dt;
          if (e.timer <= 0) {
            e.timer = 2.4 / speed;
            const d = this.hero.x < e.x ? -1 : 1;
            this.shots.push({
              x: e.x + (d > 0 ? e.w : -7),
              y: e.y + 4,
              w: 7,
              h: 7,
              vx: d * 85 * speed,
              vy: 0,
              life: 2,
              from: "enemy",
              kind: "fire",
            });
          }
          break;
        }
        case "spiker": {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.spiky = !e.spiky;
            e.timer = e.spiky ? 1.6 : 1.8 / speed;
          }
          const dist = this.hero.x - e.x;
          const sees = Math.abs(dist) < 90 && Math.abs(this.hero.y - e.y) < 30;
          const chargeSpeed = e.spiky && sees ? 78 * speed : 30 * speed;
          e.dir = sees ? Math.sign(dist) || e.dir : e.dir;
          e.vx = e.dir * chargeSpeed;
          const ahead = Math.floor((e.x + (e.dir > 0 ? e.w + 2 : -2)) / TILE);
          const below = Math.floor((e.y + e.h + 2) / TILE);
          if (this.isSolid(ahead, Math.floor((e.y + e.h - 2) / TILE)) || !this.isSolid(ahead, below)) e.dir *= -1;
          e.vy += 620 * dt;
          this.moveBody(e, e.vx * dt, Math.min(e.vy, 300) * dt, false);
          break;
        }
      }

      if (e.y > this.rows * TILE + 40) e.alive = false;

      // contact damage / spike dash kill
      const beingInhaled = this.inhaling && !this.mouthful && !(e.kind === "spiker" && e.spiky);
      if (overlaps(this.hero, e) && !beingInhaled) {
        if (this.dashTime > 0) this.killEnemy(e);
        else this.hurt(false);
      }

    }
  }

  private killEnemy(e: Enemy) {
    e.alive = false;
    this.burst(e.x + e.w / 2, e.y + e.h / 2, COLORS.orange, 10);
    this.addScore(100);
    this.sfx.hit();
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const c = Math.floor((s.x + s.w / 2) / TILE);
      const r = Math.floor((s.y + s.h / 2) / TILE);
      if (this.isSolid(c, r)) s.life = 0;
      if (s.from === "hero") {
        for (const e of this.enemies) {
          if (!e.alive || e.captured) continue;
          if (overlaps(s, e)) {
            this.killEnemy(e);
            s.life = 0;
          }
        }
      } else if (this.invuln <= 0 && overlaps(s, this.hero)) {
        s.life = 0;
        this.hurt(false);
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private hurt(pit: boolean) {
    if (!pit && this.invuln > 0) return;
    this.hearts -= 1;
    this.invuln = 1.2;
    this.power = "none";
    if (this.mouthful) {
      const cap = this.enemies.find((e) => e.captured);
      if (cap) {
        cap.captured = false;
        cap.alive = false;
      }
      this.mouthful = false;
    }
    this.burst(this.hero.x + 6, this.hero.y + 6, COLORS.red, 10);
    this.sfx.hurt();
    if (pit) {
      this.hero.x = this.safeX;
      this.hero.y = this.safeY - 4;
      this.hero.vx = 0;
      this.hero.vy = 0;
    } else {
      this.hero.vy = -140;
      this.hero.vx = -this.facing * 90;
    }
    this.pushHud();
    if (this.hearts <= 0) {
      this.finished = true;
      this.pause();
      this.sfx.gameOver();
      this.events.onGameOver(this.stageIndex + 1, this.score + this.stageScore);
    }
  }

  private clearStage() {
    this.finished = true;
    this.pause();
    const timeBonus = Math.max(0, Math.round(600 - this.stageTime * 4));
    const total = this.score + this.stageScore + 500 + this.hearts * 200 + timeBonus;
    this.score = total;
    const stage = this.stageIndex + 1;
    const clearedSecret = this.stageIndex >= LEVELS.length - 1;
    const missedSecretGate = stage === MAIN_STAGE_COUNT && total < SECRET_UNLOCK_SCORE;
    if (clearedSecret || missedSecretGate) {
      this.sfx.win();
      this.events.onWin(stage, total);
    } else {
      this.sfx.stageClear();
      this.events.onStageClear(stage, total);
    }
  }

  get remainingHearts() {
    return this.hearts;
  }

  // ---- render --------------------------------------------------------

  private px(x: number, y: number, w: number, h: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  private render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    this.px(0, 0, VIEW_W, VIEW_H, this.level.sky);

    // parallax hills (far, then near)
    const ctx2 = this.ctx;
    ctx2.save();
    ctx2.globalAlpha = 0.35;
    const far = -this.camX * 0.2;
    for (let i = 0; i < 10; i++) {
      const hx = (((i * 150 + far) % (VIEW_W + 300)) + VIEW_W + 300) % (VIEW_W + 300) - 150;
      const hh = 40 + ((i * 37) % 26);
      this.px(hx, 150 - hh, 96, hh + 42, this.level.hill);
      this.px(hx + 16, 150 - hh - 10, 64, 12, this.level.hill);
    }
    ctx2.globalAlpha = 0.62;
    const near = -this.camX * 0.45;
    for (let i = 0; i < 10; i++) {
      const hx = (((i * 170 + near) % (VIEW_W + 340)) + VIEW_W + 340) % (VIEW_W + 340) - 170;
      const hh = 26 + ((i * 53) % 20);
      this.px(hx, 160 - hh, 74, hh + 32, this.level.hill);
      this.px(hx + 12, 160 - hh - 8, 48, 10, this.level.hill);
    }
    ctx2.restore();
    this.px(0, 156, VIEW_W, VIEW_H - 156, "rgba(26,28,44,0.45)");

    // stars in sky
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 53 - this.camX * 0.15) % VIEW_W + VIEW_W) % VIEW_W;
      const sy = (i * 37) % 90;
      this.px(sx, sy, 2, 2, "rgba(244,244,244,0.5)");
    }

    ctx.save();
    ctx.translate(-Math.round(this.camX), 0);

    const c0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const c1 = Math.min(this.cols - 1, Math.ceil((this.camX + VIEW_W) / TILE));
    for (let r = 0; r < this.rows; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.isSolid(c, r)) {
          const top = !this.isSolid(c, r - 1);
          this.px(c * TILE, r * TILE, TILE, TILE, COLORS.dirt);
          if (top) {
            this.px(c * TILE, r * TILE, TILE, 5, COLORS.grass);
            this.px(c * TILE, r * TILE, TILE, 2, COLORS.green);
          }
          this.px(c * TILE + 3, r * TILE + 9, 3, 3, "rgba(0,0,0,0.18)");
          this.px(c * TILE + 10, r * TILE + 12, 3, 2, "rgba(0,0,0,0.18)");
        } else if (this.isOneWay(c, r)) {
          this.px(c * TILE, r * TILE, TILE, 4, COLORS.orange);
          this.px(c * TILE, r * TILE + 4, TILE, 2, "rgba(0,0,0,0.3)");
        }
      }
    }

    // bionic lily (stage goal)
    {
      const [dx, dy] = this.level.door;
      const gx = dx * TILE;
      const gy = dy * TILE;
      const sway = Math.round(Math.sin(this.frame / 22) * 1);
      const pulse = Math.sin(this.frame / 10) > 0;

      // stem
      this.px(gx + 7, gy + 16, 2, 16, COLORS.green);
      // leaves
      this.px(gx + 3, gy + 24, 4, 2, COLORS.green);
      this.px(gx + 9, gy + 27, 4, 2, COLORS.green);
      this.px(gx + 2, gy + 23, 2, 2, COLORS.grass);
      this.px(gx + 12, gy + 26, 2, 2, COLORS.grass);

      // petals — a lily opening upward, paper white with pink tips
      const cx = gx + 8 + sway;
      const top = gy + 2;
      // back petals
      this.px(cx - 2, top, 4, 6, COLORS.pink);
      this.px(cx - 6, top + 3, 3, 5, COLORS.pink);
      this.px(cx + 3, top + 3, 3, 5, COLORS.pink);
      // main petals
      this.px(cx - 3, top + 2, 6, 8, COLORS.paper);
      this.px(cx - 5, top + 5, 10, 6, COLORS.paper);
      // petal tips
      this.px(cx - 6, top + 4, 2, 2, COLORS.paper);
      this.px(cx + 4, top + 4, 2, 2, COLORS.paper);
      // glowing bionic heart
      this.px(cx - 1, top + 6, 2, 3, pulse ? CYAN : CYAN_DIM);
      this.px(cx - 2, top + 8, 4, 2, pulse ? CYAN : CYAN_DIM);
      // circuit traces on the petals
      this.px(cx - 4, top + 6, 1, 3, CYAN_DIM);
      this.px(cx + 3, top + 6, 1, 3, CYAN_DIM);

      // ethereal motes drifting up around the bloom
      for (let i = 0; i < 3; i++) {
        const my = gy + 26 - ((this.frame / 2 + i * 10) % 24);
        const mx = gx + 2 + i * 6 + Math.round(Math.sin((this.frame + i * 20) / 16) * 2);
        this.px(mx, my, 1, 1, i === 1 ? COLORS.paper : CYAN);
      }
      // soft glow at the base
      if (pulse) this.px(gx + 5, gy + 30, 6, 1, "rgba(92,242,255,0.4)");
    }

    // stars
    for (const s of this.stars) {
      if (s.taken) continue;
      const bob = Math.sin((this.frame + s.x) / 14) * 2;
      this.px(s.x + 3, s.y + bob, 4, 10, COLORS.yellow);
      this.px(s.x, s.y + 3 + bob, 10, 4, COLORS.yellow);
      this.px(s.x + 2, s.y + 2 + bob, 6, 6, COLORS.paper);
    }

    for (const e of this.enemies) if (e.alive && !e.captured) this.drawEnemy(e);
    for (const s of this.shots) {
      const col = s.kind === "fire" ? (this.frame % 6 < 3 ? COLORS.orange : COLORS.yellow) : COLORS.paper;
      this.px(s.x, s.y, s.w, s.h, col);
      this.px(s.x + 2, s.y + 2, s.w - 4, s.h - 4, s.kind === "fire" ? COLORS.paper : COLORS.blue);
    }

    this.drawHero();

    for (const p of this.particles) this.px(p.x, p.y, 3, 3, p.c);

    // inhale cone
    if (this.inhaling && !this.mouthful) {
      for (let i = 1; i <= 8; i++) {
        const w = 3 + Math.round(i * 0.8);
        const x = this.hero.x + (this.facing > 0 ? this.hero.w + i * 8 : -i * 8 - w);
        const y = this.hero.y + 5 - i + ((this.frame / 3 + i) % 5);
        this.px(x, y, w, w, "rgba(244,244,244,0.5)");

      }
    }

    ctx.restore();
  }

  private drawEnemy(e: Enemy) {
    const f = this.frame;
    if (e.kind === "walker") {
      this.px(e.x, e.y + 2, 12, 10, COLORS.orange);
      this.px(e.x + 1, e.y, 10, 3, COLORS.orange);
      this.px(e.x + 2, e.y + 4, 2, 3, COLORS.ink);
      this.px(e.x + 8, e.y + 4, 2, 3, COLORS.ink);
      const step = f % 20 < 10 ? 0 : 1;
      this.px(e.x + 1, e.y + 12, 3, 2 - step, COLORS.red);
      this.px(e.x + 8, e.y + 12, 3, 1 + step, COLORS.red);
    } else if (e.kind === "flyer") {
      const flap = f % 16 < 8 ? 0 : 2;
      this.px(e.x - 4, e.y + 3 - flap, 4, 4, COLORS.paper);
      this.px(e.x + 12, e.y + 3 - flap, 4, 4, COLORS.paper);
      this.px(e.x, e.y + 1, 12, 11, COLORS.blue);
      this.px(e.x + 2, e.y + 4, 2, 3, COLORS.ink);
      this.px(e.x + 8, e.y + 4, 2, 3, COLORS.ink);
      this.px(e.x + 5, e.y + 8, 3, 2, COLORS.yellow);
    } else if (e.kind === "blob") {
      const puff = f % 40 < 20 ? 0 : 1;
      this.px(e.x, e.y + 2 - puff, 14, 11 + puff, COLORS.red);
      this.px(e.x + 2, e.y, 10, 3, COLORS.red);
      this.px(e.x + 3, e.y + 5, 2, 3, COLORS.ink);
      this.px(e.x + 9, e.y + 5, 2, 3, COLORS.ink);
      this.px(e.x + 5, e.y + 9, 4, 3, COLORS.orange);
    } else {
      this.px(e.x, e.y + 2, 12, 10, COLORS.purple);
      this.px(e.x + 2, e.y + 5, 2, 3, COLORS.ink);
      this.px(e.x + 8, e.y + 5, 2, 3, COLORS.ink);
      if (e.spiky) {
        this.px(e.x + 1, e.y - 3, 2, 4, COLORS.paper);
        this.px(e.x + 5, e.y - 4, 2, 5, COLORS.paper);
        this.px(e.x + 9, e.y - 3, 2, 4, COLORS.paper);
        this.px(e.x - 3, e.y + 5, 4, 2, COLORS.paper);
        this.px(e.x + 11, e.y + 5, 4, 2, COLORS.paper);
      }
    }
  }

  private drawHero() {
    if (this.invuln > 0 && this.frame % 8 < 4) return;
    const h = this.hero;
    const puffed = this.puffTime > 0 && !this.onGround;
    const shell = this.mouthful ? COLORS.orange : COLORS.paper;
    const glow = this.mouthful ? COLORS.yellow : CYAN;
    const w = puffed ? 14 : 12;
    const ht = puffed ? 14 : 12;
    const x = h.x - (w - h.w) / 2;
    const y = h.y - (ht - h.h);
    const f = this.facing;
    const flap = this.frame % 8 < 4 ? 0 : 1;

    // wings (behind the shell)
    const wingX = f > 0 ? x - 1 : x + w - 4;
    this.px(wingX - (f > 0 ? 3 : -3), y - 1 + flap, 6, 2, CYAN_DIM);
    this.px(wingX - (f > 0 ? 4 : -4), y + 2 - flap, 7, 2, CYAN_DIM);
    this.px(wingX, y + flap, 3, 1, CYAN);

    // antennae
    this.px(x + 3, y - 4, 1, 3, COLORS.paper);
    this.px(x + w - 4, y - 4, 1, 3, COLORS.paper);
    this.px(x + 3, y - 5, 1, 1, glow);
    this.px(x + w - 4, y - 5, 1, 1, glow);

    // helmet dome + body shell
    this.px(x + 2, y - 1, w - 4, 3, shell);
    this.px(x + 1, y, w - 2, ht - 1, shell);
    this.px(x, y + 2, w, ht - 5, shell);

    // dark visor / face plate
    this.px(x + 2, y + 2, w - 4, 5, COLORS.ink);

    // glowing eyes
    const ex = f > 0 ? x + 5 : x + 3;
    this.px(ex, y + 3, 2, 2, glow);
    this.px(ex + (f > 0 ? 3 : -3), y + 3, 2, 2, glow);

    // chest emblem (triangle)
    this.px(x + w / 2 - 1, y + 8, 2, 1, glow);
    this.px(x + w / 2 - 2, y + 9, 4, 1, glow);

    // bee stripes on the underside
    this.px(x + 1, y + ht - 4, w - 2, 1, COLORS.ink);

    // legs
    this.px(x + 1, y + ht - 2, 3, 3, CYAN_DIM);
    this.px(x + w - 4, y + ht - 2, 3, 3, CYAN_DIM);

    // inhale mouth vent
    if (this.inhaling) this.px(f > 0 ? x + w - 3 : x, y + 8, 3, 4, COLORS.ink);

    // power crown
    if (this.power !== "none") {
      const col =
        this.power === "fire"
          ? COLORS.orange
          : this.power === "star"
            ? COLORS.yellow
            : this.power === "hover"
              ? COLORS.blue
              : COLORS.purple;
      this.px(x + 1, y - 8, w - 2, 2, col);
      this.px(x + 3, y - 10, 2, 2, col);
      this.px(x + w - 5, y - 10, 2, 2, col);
    }
  }
}

export const STAGE_COUNT = LEVELS.length;
