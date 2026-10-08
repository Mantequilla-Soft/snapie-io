// @ts-nocheck — boss encounters. Each boss = act() logic + draw() + hit/hurt boxes.
import { R, line, disc, ring, overlap, clamp, txt, type Box, type Ctx, W } from "./core";
import type { Game } from "./game";

const FLOOR = 176;
export abstract class Boss {
  hp: number; maxHp: number; t = 0; flash = 0; dead = false; deathT = 0; intro = 100; phase = 1; mt = 0;
  constructor(public g: Game, public ax: number, public name: string, hp: number) { this.hp = this.maxHp = hp; }
  abstract act(): void; abstract draw(c: Ctx, cx: number): void; abstract hit(): Box[];
  hurt(): Box[] { return this.hit(); }
  introMove() {}
  deathLen() { return 170; }
  update() {
    const g = this.g; this.t++; if (this.flash > 0) this.flash--;
    if (this.dead) {
      this.deathT++;
      if (this.deathT % 5 === 0) { const bs = this.hit()[0] || { x: this.ax + 250, y: 100, w: 60, h: 60 }; g.boom(bs.x + Math.random() * bs.w, bs.y + Math.random() * bs.h, 1 + Math.random() * 1.5); g.audio.sfx("boom"); g.shake = 5; }
      if (this.deathT === this.deathLen()) g.bossDefeated();
      return;
    }
    if (this.intro > 0) { this.intro--; this.introMove(); return; }
    this.act();
    const p = g.player;
    if (!p.dead) for (const b of this.hurt()) if (overlap(b, p)) { p.hurt(g); break; }
  }
  damage(n: number, weak = false) {
    if (this.dead || this.intro > 0) return;
    this.hp -= weak ? n * 2 : n; this.flash = 3; this.g.audio.sfx("bosshit");
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.g.score += this.name === "THE HOG" ? 50000 : 10000; this.g.audio.sfx("boom"); this.g.audio.music(null); }
  }
  flashOver(c: Ctx, cx: number) {
    if (this.flash <= 0) return;
    c.globalAlpha = 0.3; for (const b of this.hit()) R(c, b.x - cx, b.y, b.w, b.h, "#ffffff"); c.globalAlpha = 1;
  }
  get p() { return this.g.player; }
  bomb(x: number, y: number, tx: number, tt: number, k = "bomb") {
    const gr = 0.18, dy = FLOOR - 4 - y; const vy = (dy - 0.5 * gr * tt * tt) / tt;
    this.g.eb.push({ x, y, vx: (tx - x) / tt, vy, r: 4, k, g: gr, life: 400, t: 0 });
  }
  spread(x: number, y: number, n: number, sp: number, step: number, k = "orb") {
    const a0 = Math.atan2(this.p.y + 10 - y, this.p.x + 5 - x);
    for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * step; this.g.eb.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3, k, life: 300, t: 0 }); }
  }
  // Horizontal beam helper: { y, h, t, warn, dur }
  beam: { y: number; h: number; t: number; warn: number; dur: number; x0: number } | null = null;
  fireBeam(y: number, h: number, x0: number, warn = 50, dur = 40) { this.beam = { y, h, t: 0, warn, dur, x0 }; this.g.audio.sfx("warn"); }
  tickBeam() {
    const b = this.beam; if (!b) return; b.t++;
    if (b.t === b.warn) { this.g.audio.sfx("beam"); this.g.shake = 4; }
    if (b.t > b.warn && overlap({ x: this.ax, y: b.y, w: b.x0 - this.ax, h: b.h }, this.p)) this.p.hurt(this.g);
    if (b.t > b.warn + b.dur) this.beam = null;
  }
  drawBeam(c: Ctx, cx: number, col = "#ff2a6d") {
    const b = this.beam; if (!b) return;
    if (b.t < b.warn) { if (b.t % 6 < 3) R(c, this.ax - cx, b.y + b.h / 2, b.x0 - this.ax, 1, col); return; }
    const k = Math.sin(b.t * 0.8) * 2;
    R(c, this.ax - cx, b.y - k, b.x0 - this.ax, b.h + k * 2, col); R(c, this.ax - cx, b.y + 2, b.x0 - this.ax, b.h - 4, "#ffe0f0");
    for (let i = 0; i < 6; i++) R(c, this.ax - cx + Math.random() * (b.x0 - this.ax), b.y - 4 + Math.random() * (b.h + 8), 3, 2, "#fff");
  }
}

// ---------------- WORLD 1: THE HARVESTER ----------------
class Harvester extends Boss {
  x: number; home: number; mode = 0;
  constructor(g: Game, ax: number) { super(g, ax, "THE HARVESTER", 110); this.home = ax + 250; this.x = ax + 430; }
  override introMove() { this.x += (this.home - this.x) * 0.05; }
  act() {
    const g = this.g, p = this.p;
    if (this.phase === 1 && this.hp < this.maxHp / 2) { this.phase = 2; g.shake = 8; g.flashT = 8; g.audio.sfx("bossatk"); g.addText("OVERCLOCKED!", this.x, 90, "#ff4d4d"); this.mt = 0; }
    this.mt++;
    if (this.mode === 0) {
      if (this.mt % (this.phase === 1 ? 90 : 66) === 45) { const n = this.phase + 1; for (let i = 0; i < n; i++) this.bomb(this.x + 50, FLOOR - 74, p.x + (i - 1) * 26, 55 + i * 10); g.audio.sfx("bossatk"); }
      if (this.mt % 230 === 120 && g.enemies.length < 3) g.spawnEnemy(Math.random() < 0.5 ? "term" : "dog", this.x + 34, FLOOR - 30);
      if (this.phase === 2 && this.mt > 250) { this.mode = 1; this.mt = 0; g.audio.sfx("warn"); }
    } else if (this.mode === 1) {
      if (this.mt > 45) this.x -= 3.3; else this.x += Math.sin(this.mt) * 1;
      if (this.x <= this.ax + 30) { this.mode = 2; this.mt = 0; g.shake = 6; }
    } else {
      this.x += 1.6;
      if (this.x >= this.home) { this.x = this.home; this.mode = 0; this.mt = 0; this.spread(this.x + 50, FLOOR - 74, 5, 2.2, 0.25); }
    }
    if (this.t % 6 === 0) g.parts.push({ x: this.x + 52, y: FLOOR - 74, vx: 0.3, vy: -0.6, life: 50, col: this.phase === 2 ? "#3a3a3a" : "#9a9a9a", s: 4, g: -0.005 });
  }
  hit() { return [{ x: this.x + 30, y: FLOOR - 62, w: 96, h: 62 }]; }
  override hurt() { return [...this.hit(), { x: this.x, y: FLOOR - 44, w: 32, h: 40 }]; }
  draw(c: Ctx, cx: number) {
    const x = Math.round(this.x - cx) + (this.flash ? 1 : 0), f = FLOOR, t = this.t;
    // grain tank w/ data
    R(c, x + 40, f - 68, 30, 22, "#b8b8a8"); R(c, x + 42, f - 66, 26, 18, "#4a5a30");
    for (let i = 0; i < 8; i++) txt(c, (i + t / 8) % 2 < 1 ? "1" : "0", x + 43 + (i % 4) * 6, f - 64 + Math.floor(i / 4) * 8, "#7dff6a", 5, "left", null);
    R(c, x + 50, f - 80, 4, 14, "#555"); // stack
    // body
    R(c, x + 30, f - 46, 96, 34, "#a8221f"); R(c, x + 30, f - 46, 96, 3, "#e0463f"); R(c, x + 30, f - 15, 96, 3, "#6a1210");
    for (let i = 0; i < 5; i++) R(c, x + 36 + i * 16, f - 38, 10, 2, "#6a1210");
    txt(c, "HRV-01", x + 82, f - 30, "#ffd21f", 5, "left", null);
    // cab
    R(c, x + 74, f - 70, 40, 24, "#8a1a18"); R(c, x + 78, f - 66, 32, 16, "#1a1426");
    const ex = clamp((this.p.x - cx - (x + 94)) / 30, -3, 3);
    disc(c, x + 94 + ex, f - 58, 5, this.phase === 2 ? "#ff2020" : "#ff6a00"); disc(c, x + 94 + ex, f - 58, 2, "#fff4a0");
    R(c, x + 84, f - 50, 20, 2, "#ff6a00");
    // wheels
    const wr = this.mode ? t * 0.4 : t * 0.08;
    for (const [wx, r] of [[x + 104, 17], [x + 52, 11]] as const) {
      disc(c, wx, f - r, r, "#1a1426"); disc(c, wx, f - r, r - 4, "#3a3150"); disc(c, wx, f - r, 3, "#9aa3b5");
      for (let i = 0; i < 4; i++) { const a = wr + (i * Math.PI) / 2; line(c, wx, f - r, wx + Math.cos(a) * (r - 4), f - r + Math.sin(a) * (r - 4), 2, "#9aa3b5"); }
    }
    // reel
    const rx = x + 16, ry = f - 26, ra = t * (this.mode ? 0.45 : 0.12);
    R(c, rx - 2, ry - 2, 30, 4, "#6a6a6a"); R(c, x + 26, ry, 6, 18, "#6a6a6a");
    for (let i = 0; i < 5; i++) { const a = ra + (i * Math.PI * 2) / 5; line(c, rx, ry, rx + Math.cos(a) * 16, ry + Math.sin(a) * 16, 2, "#ffd21f"); R(c, rx + Math.cos(a) * 16 - 2, ry + Math.sin(a) * 16 - 2, 4, 4, "#c8c8c8"); }
    disc(c, rx, ry, 3, "#ffd21f");
    R(c, x - 2, f - 8, 36, 6, "#555"); for (let i = 0; i < 9; i++) R(c, x - 2 + i * 4, f - 4, 2, 3, "#ddd");
    if (this.phase === 2 && t % 10 < 5) R(c, x + 60, f - 52, 4, 4, "#ff8a00");
    this.flashOver(c, cx);
  }
}

// ---------------- WORLD 2: THE FACTORY OVERSEER ----------------
class Overseer extends Boss {
  x: number; y = -70; elec = 0;
  constructor(g: Game, ax: number) { super(g, ax, "FACTORY OVERSEER", 140); this.x = ax + 192; }
  override introMove() { this.y += (40 - this.y) * 0.06; }
  act() {
    const g = this.g, p = this.p;
    if (this.phase === 1 && this.hp < this.maxHp / 2) { this.phase = 2; g.shake = 8; g.flashT = 8; g.addText("SAFETY OFF!", this.x - 40, 100, "#ff4d4d"); this.mt = 0; }
    this.mt++;
    const sp = this.phase === 1 ? 0.014 : 0.022;
    this.x = this.ax + 192 + Math.sin(this.t * sp) * 150; this.y = 40 + Math.sin(this.t * 0.05) * 4;
    if (this.mt % (this.phase === 1 ? 85 : 60) === 0) { g.eb.push({ x: this.x, y: this.y + 40, vx: 0, vy: 0.5, r: 5, k: "slag", g: 0.15, life: 300, t: 0 }); g.audio.sfx("bossatk"); }
    if (this.mt % 120 === 60) this.spread(this.x, this.y + 22, this.phase === 1 ? 3 : 5, 2.2, 0.22);
    if (this.phase === 2) {
      if (this.mt % 380 === 100) { this.elec = 1; g.audio.sfx("warn"); g.addText("FLOOR ELECTRIFIED - GET UP!", this.ax + 70, 100, "#5fe3ff"); }
      if (this.elec > 0) {
        this.elec++;
        if (this.elec > 70 && this.elec < 190 && p.onGround && p.ground !== 2 && p.y + p.h >= FLOOR - 1) p.hurt(g);
        if (this.elec === 70) g.audio.sfx("beam");
        if (this.elec >= 190) this.elec = 0;
      }
    }
  }
  hit() { return [{ x: this.x - 18, y: this.y + 6, w: 36, h: 32 }]; }
  draw(c: Ctx, cx: number) {
    const x = Math.round(this.x - cx), y = Math.round(this.y), t = this.t, ax = this.ax - cx;
    R(c, ax, 14, W, 6, "#5a5a5a"); for (let i = 0; i < 24; i++) R(c, ax + i * 16 + 2, 15, 3, 3, "#2a2a2a");
    R(c, x - 14, 8, 28, 10, "#ffd21f"); for (let i = 0; i < 4; i++) R(c, x - 12 + i * 7, 8, 3, 10, "#1a1426");
    line(c, x - 6, 18, x - 8, y + 6, 2, "#333"); line(c, x + 6, 18, x + 8, y + 6, 2, "#333");
    // body
    R(c, x - 18, y + 6, 36, 30, "#3a4256"); R(c, x - 18, y + 6, 36, 3, "#6a7590"); R(c, x - 14, y + 34, 28, 6, "#2a3040");
    disc(c, x, y + 20, 9, "#1a1426"); disc(c, x, y + 20, 7, "#5a1010");
    const ea = Math.atan2(this.p.y - y - 20, this.p.x - cx - x);
    disc(c, x + Math.cos(ea) * 3, y + 20 + Math.sin(ea) * 3, 3, this.phase === 2 ? "#ff3030" : "#ff9a00"); R(c, x - 4 + Math.cos(ea) * 3, y + 16, 2, 2, "#fff");
    for (let s = -1; s <= 1; s += 2) {
      const sw = Math.sin(t * 0.07 + s) * 4, bx = x + s * 20, ex = bx + s * 6 + sw, ey = y + 46;
      line(c, x + s * 16, y + 14, bx, y + 30, 3, "#6a7590"); line(c, bx, y + 30, ex, ey, 3, "#6a7590");
      const op = Math.abs(Math.sin(t * 0.1)) * 4;
      line(c, ex, ey, ex - 4 - op, ey + 8, 2, "#ffd21f"); line(c, ex, ey, ex + 4 + op, ey + 8, 2, "#ffd21f");
    }
    R(c, x - 10, y + 10, 3, 2, t % 20 < 10 ? "#7dff6a" : "#1a3a1a"); R(c, x + 7, y + 10, 3, 2, t % 20 >= 10 ? "#ff4d4d" : "#3a1a1a");
    if (this.elec > 0) {
      const active = this.elec > 70 && this.elec < 190;
      if (!active && this.elec % 8 < 4) R(c, ax, FLOOR - 2, W, 2, "#ffd21f");
      if (active) for (let i = 0; i < 24; i++) { const bx = ax + i * 16 + Math.random() * 10; line(c, bx, FLOOR, bx + 4, FLOOR - 6 - Math.random() * 6, 1, "#9ff4ff"); line(c, bx + 4, FLOOR - 8, bx + 8, FLOOR, 1, "#5fe3ff"); }
    }
    if (this.phase === 2 && t % 7 === 0) this.g.sparks(this.x + (Math.random() - 0.5) * 30, this.y + 30, "#ffb000", 2);
    this.flashOver(c, cx);
  }
}

// ---------------- WORLD 3: THE NETWORK ENFORCER ----------------
class Enforcer extends Boss {
  x: number; y = -60; vx = 0; vy = 0; face = -1; mode = "idle"; onG = false; walk = 0;
  constructor(g: Game, ax: number) { super(g, ax, "NETWORK ENFORCER", 150); this.x = ax + 300; }
  override introMove() { this.vy += 0.3; this.y = Math.min(this.y + this.vy, FLOOR - 46); if (this.y >= FLOOR - 46 && this.vy > 2) { this.g.shake = 6; this.vy = 0; } }
  act() {
    const g = this.g, p = this.p;
    if (this.phase === 1 && this.hp < this.maxHp / 2) { this.phase = 2; g.flashT = 8; g.shake = 6; g.addText("FIREWALL ENGAGED", this.x - 30, 90, "#5fe3ff"); }
    this.mt++;
    this.vy = Math.min(this.vy + 0.3, 7); this.x += this.vx; this.y += this.vy;
    const wasAir = !this.onG; this.onG = false;
    if (this.y >= FLOOR - 46) { this.y = FLOOR - 46; this.vy = 0; this.onG = true; }
    this.x = clamp(this.x, this.ax + 8, this.ax + W - 36);
    if (this.mode === "idle") {
      this.vx = 0; this.face = p.x < this.x ? -1 : 1;
      if (this.mt > (this.phase === 1 ? 50 : 32)) {
        const r = Math.random(); this.mt = 0;
        if (r < 0.35) { this.mode = "jump"; this.vy = -7; const tx = this.x < this.ax + 192 ? this.ax + 300 : this.ax + 40; this.vx = (tx - this.x) / 46; }
        else if (r < 0.7 || this.phase === 1) this.mode = "shoot";
        else { this.mode = "dash"; g.audio.sfx("warn"); }
      }
    } else if (this.mode === "shoot") {
      if (this.mt % 20 === 10) { this.spread(this.x + 14 + this.face * 16, this.y + 18, 3, 2.6, 0.22); g.audio.sfx("bossatk"); }
      if (this.phase === 2 && this.mt === 50) for (let i = 0; i < 2; i++) g.eb.push({ x: this.x + 14, y: this.y, vx: (i ? 1 : -1) * 1.5, vy: -2, r: 3, k: "ping", life: 260, t: 0 });
      if (this.mt > 64) { this.mode = "idle"; this.mt = 0; }
    } else if (this.mode === "jump") {
      if (this.onG && this.mt > 5) {
        this.vx = 0; g.shake = 5; this.mode = "idle"; this.mt = 0; g.audio.sfx("boom");
        for (const d of [-1, 1]) g.eb.push({ x: this.x + 14 + d * 16, y: FLOOR - 6, vx: d * 2.6, vy: 0, r: 5, k: "wave", life: 160, t: 0 });
      }
    } else if (this.mode === "dash") {
      this.vx = this.mt < 30 ? 0 : this.face * 4.2;
      if (this.mt > 30 && (this.x <= this.ax + 8 || this.x >= this.ax + W - 36)) { this.mode = "idle"; this.mt = 0; g.shake = 4; }
    }
    if (this.onG && this.vx !== 0) this.walk++;
    void wasAir;
  }
  hit() { return [{ x: this.x, y: this.y, w: 28, h: 46 }]; }
  draw(c: Ctx, cx: number) {
    const x = Math.round(this.x - cx), y = Math.round(this.y), f = this.face, t = this.t;
    c.save(); c.translate(x + 14, y); c.scale(f, 1);
    const ph = this.walk * 0.25, air = !this.onG;
    for (const s of [-1, 1]) {
      const fx = air ? s * 4 : Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 6, lift = air ? 6 : Math.max(0, Math.cos(ph + (s > 0 ? 0 : Math.PI))) * 3;
      line(c, s * 4, 28, fx + 2, 37 - lift / 2, 5, s > 0 ? "#2a3a6a" : "#1a2448"); line(c, fx + 2, 37 - lift / 2, fx, 44 - lift, 5, s > 0 ? "#2a3a6a" : "#1a2448");
      R(c, fx - 4, 43 - lift, 10, 3, "#0d1226");
    }
    R(c, -11, 8, 22, 22, "#24305a"); R(c, -11, 8, 22, 3, "#4a5c9a"); R(c, -8, 28, 16, 3, "#ff8a00");
    for (let i = 0; i < 3; i++) ring(c, 0, 22, 2 + i * 3, (t / 6 + i) % 3 < 1 ? "#5fe3ff" : "#2a5a8a", 6, 1, -Math.PI * 0.75);
    R(c, -14, 6, 8, 8, "#3a4a80"); R(c, 6, 6, 8, 8, "#3a4a80");
    line(c, -12, 6, -16, -4, 2, "#9aa3b5"); disc(c, -17, -5, 3, "#9aa3b5"); R(c, -18, -6, 2, 2, t % 30 < 15 ? "#ff3030" : "#601010");
    R(c, -6, -2, 12, 10, "#1a2448"); R(c, -5, 2, 10, 3, this.phase === 2 ? "#ff3030" : "#ff8a00"); R(c, -2, 2, 2, 3, "#fff6c0");
    const aa = Math.atan2(this.p.y + 10 - y - 14, (this.p.x + 5 - (x + cx + 14)) * f);
    line(c, 8, 12, 8 + Math.cos(aa) * 16, 12 + Math.sin(aa) * 16, 5, "#5a6275"); R(c, 6 + Math.cos(aa) * 16, 10 + Math.sin(aa) * 16, 4, 4, "#ff8a00");
    if (this.mode === "dash") { c.globalAlpha = 0.6 + Math.sin(t) * 0.2; R(c, 16, -2, 4, 46, "#5fe3ff"); R(c, 14, 4, 2, 34, "#c0f8ff"); c.globalAlpha = 1; }
    c.restore();
    this.flashOver(c, cx);
  }
}

// ---------------- WORLD 4: THE DATA WARDEN ----------------
class Warden extends Boss {
  x: number; eye = 0;
  constructor(g: Game, ax: number) { super(g, ax, "THE DATA WARDEN", 170); this.x = ax + 290; }
  override introMove() { this.eye = Math.min(1, this.eye + 0.01); }
  act() {
    const g = this.g;
    if (this.phase === 1 && this.hp < this.maxHp / 2) { this.phase = 2; g.flashT = 8; g.shake = 6; g.addText("FIREWALL BREACH PROTOCOL", this.ax + 60, 70, "#ff4d6d"); }
    this.mt++; this.tickBeam();
    const cyc = this.phase === 1 ? 200 : 150, m = this.mt % cyc;
    if (m === 10) { const low = Math.random() < 0.5; this.fireBeam(low ? FLOOR - 9 : FLOOR - 25, low ? 8 : 9, this.x); this.eye = 1; }
    if (m === 110) { for (let i = 0; i < (this.phase === 1 ? 5 : 8); i++) g.eb.push({ x: this.x, y: 60 + i * 14, vx: -1.7 - Math.random() * 0.5, vy: 0, r: 3, k: "packet", life: 300, t: i * 6 }); g.audio.sfx("bossatk"); }
    if (this.phase === 2 && m === 130 && g.enemies.length < 3) g.spawnEnemy(Math.random() < 0.5 ? "orb" : "para", this.x - 10, Math.random() < 0.5 ? 80 : FLOOR - 10);
    this.eye += ((m > 5 && m < 140 ? 1 : 0.15) - this.eye) * 0.1;
  }
  hit() { const b = [{ x: this.x, y: FLOOR - 120, w: 76, h: 120 }]; if (this.eye > 0.6) b.unshift({ x: this.x + 22, y: FLOOR - 92, w: 32, h: 22, weak: true }); return b; }
  override hurt() { return [{ x: this.x + 6, y: FLOOR - 120, w: 70, h: 120 }]; }
  draw(c: Ctx, cx: number) {
    const x = Math.round(this.x - cx), f = FLOOR, t = this.t;
    R(c, x - 4, f - 124, 84, 124, "#0b0f1a"); R(c, x, f - 120, 76, 120, "#1c2438"); R(c, x, f - 120, 76, 3, "#9aa3b5"); R(c, x, f - 120, 3, 120, "#5a6275"); R(c, x + 73, f - 120, 3, 120, "#5a6275");
    for (let u = 0; u < 7; u++) { const uy = f - 64 + u * 9; R(c, x + 6, uy, 64, 7, "#121828"); for (let l = 0; l < 6; l++) R(c, x + 10 + l * 9, uy + 3, 2, 2, hash2(u * 7 + l, Math.floor(t / 8)) ? "#7dff6a" : "#ff9a00"); }
    disc(c, x + 38, f - 126, 5, t % 20 < 10 ? "#ff2a2a" : "#601010");
    // monitor eye
    R(c, x + 18, f - 100, 40, 32, "#05070d"); R(c, x + 20, f - 98, 36, 28, "#0a2a3a");
    const eh = Math.round(this.eye * 11);
    if (eh > 0) { R(c, x + 24, f - 84 - eh, 28, eh * 2, "#e8f8ff"); const pa = clamp((this.p.x - cx - (x + 38)) / 40, -6, 6); disc(c, x + 38 + pa, f - 84, Math.min(6, eh), this.phase === 2 ? "#ff2a6d" : "#00c8ff"); disc(c, x + 38 + pa, f - 84, Math.min(2, eh), "#000"); }
    else R(c, x + 24, f - 85, 28, 2, "#5fe3ff");
    for (let i = 0; i < 14; i++) R(c, x + 20, f - 98 + i * 2, 36, 1, "rgba(0,0,0,0.25)");
    for (const s of [0, 1]) {
      const bx = s ? x + 76 : x, sw = Math.sin(t * 0.05 + s * 2) * 5;
      for (let i = 0; i < 4; i++) line(c, bx, f - 70 + i * 3, bx + (s ? 10 : -14) + sw, f - 30 + i * 2, 2, ["#ff4d6d", "#5fe3ff", "#ffd21f", "#7dff6a"][i]);
      R(c, bx + (s ? 6 : -18) + sw, f - 30, 12, 8, "#9aa3b5"); R(c, bx + (s ? 10 : -16) + sw, f - 22, 2, 4, "#ffd21f"); R(c, bx + (s ? 14 : -12) + sw, f - 22, 2, 4, "#ffd21f");
    }
    this.drawBeam(c, cx); this.flashOver(c, cx);
  }
}
function hash2(a: number, b: number) { const v = Math.sin(a * 91.3 + b * 47.7) * 1e4; return v - Math.floor(v) > 0.45; }

// ---------------- FINAL: THE HOG ----------------
export class Hog extends Boss {
  x0: number; rams: { x: number; y: number; on: boolean }[] = []; fan = 0; eaten = 0; vents: { x: number; t: number }[] = []; finalDone = false; sweep: { y: number; t: number } | null = null;
  arm = { t: 0, tx: 0 };
  constructor(g: Game, ax: number) {
    super(g, ax, "THE HOG", 420); this.x0 = ax + 214;
    for (let i = 0; i < 8; i++) this.rams.push({ x: ax + 18 + (i % 4) * 46, y: 22 + Math.floor(i / 4) * 34, on: true });
  }
  get coreX() { return this.x0 + 80; }
  get coreY() { return 128; }
  override deathLen() { return 260; }
  absorb() { this.eaten++; this.hp = Math.min(this.maxHp * 0.33, this.hp + 14); this.g.audio.sfx("chomp"); this.g.addText("+RAM", this.coreX - 10, 100, "#7dff6a"); this.g.shake = 3; }
  act() {
    const g = this.g, p = this.p, r = this.hp / this.maxHp;
    if (this.phase === 1 && r < 0.66) { this.phase = 2; g.flashT = 10; g.shake = 10; g.addText("WARNING: OVERHEATING", this.ax + 60, 120, "#ff4d4d"); g.audio.sfx("warn"); this.mt = 0; }
    if (this.phase === 2 && r < 0.33) { this.phase = 3; g.flashT = 14; g.shake = 14; g.addText("CORE EXPOSED!", this.ax + 100, 120, "#ffd21f"); for (let i = 0; i < 20; i++) g.sparks(this.coreX, this.coreY, "#9aa3b5", 2); g.boom(this.coreX, this.coreY, 2.5); this.mt = 0; }
    this.mt++; this.tickBeam();
    this.fan += this.phase === 1 ? 0.15 : 0.5;
    const m = this.mt, sp = this.phase === 1 ? 1 : 0.75;
    // turrets
    if (m % Math.round(90 * sp) === 0) for (const ty of [70, 150]) this.spread(this.x0 + 16, ty, 1, 2.3, 0);
    if (m % Math.round(140 * sp) === 40) { this.spread(this.x0 + 70, 70, this.phase === 1 ? 5 : 7, 2.1, 0.2); g.audio.sfx("bossatk"); }
    if (m % Math.round(300 * sp) === 150 && !this.beam) { const low = Math.random() < 0.5; this.fireBeam(low ? FLOOR - 9 : FLOOR - 25, low ? 8 : 9, this.x0 + 10); }
    if (m % Math.round(360 * sp) === 250 && g.enemies.filter((e) => e.type === "drone").length < 2) { g.spawnEnemy("drone", this.ax + 60, 30); g.spawnEnemy("drone", this.ax + 140, 20); }
    if (m % Math.round(200 * sp) === 100) for (let i = 0; i < 3; i++) g.fallers.push({ x: clamp(p.x - 30 + i * 30 + (Math.random() - 0.5) * 20, this.ax + 4, this.x0 - 24), y: -20, vy: 0, st: 1, t: 20 + i * 8, w: 20, h: 14, kind: "ram" });
    if (this.phase >= 2) {
      if (m % 7 === 0) g.parts.push({ x: this.x0 + 120 + Math.random() * 40, y: 30 + Math.random() * 100, vx: -0.3, vy: -0.8, life: 40, col: "#c8c8d0", s: 3, g: -0.01 });
      if (m % 260 === 30) { this.vents = [0, 1, 2].map((i) => ({ x: this.ax + 40 + i * 64 + Math.random() * 20, t: 0 })); g.audio.sfx("warn"); }
      if (m % 230 === 120) { this.arm.t = 1; this.arm.tx = p.x; }
    }
    for (const v of this.vents) { v.t++; if (v.t > 50 && v.t < 110 && overlap({ x: v.x - 7, y: 0, w: 14, h: FLOOR }, p)) p.hurt(g); if (v.t === 50) g.audio.sfx("beam"); }
    this.vents = this.vents.filter((v) => v.t < 110);
    if (this.arm.t > 0) {
      this.arm.t++;
      if (this.arm.t === 50) { g.shake = 8; g.audio.sfx("boom"); for (const d of [-1, 1]) g.eb.push({ x: this.arm.tx, y: FLOOR - 6, vx: d * 2.4, vy: 0, r: 5, k: "wave", life: 140, t: 0 }); }
      if (this.arm.t > 90) this.arm.t = 0;
    }
    if (this.phase === 3) {
      if (m % 140 === 60) { const left = this.rams.filter((q) => q.on); if (left.length) { const q = left[Math.floor(Math.random() * left.length)]; q.on = false; g.spawnEnemy("ram", q.x, q.y); g.addText("IT'S EATING THE RAM!", this.ax + 60, 140, "#7dff6a"); } }
      if (!this.finalDone && r < 0.12) { this.finalDone = true; this.sweep = { y: 30, t: 0 }; g.addText("MAXIMUM HOARD - GET DOWN!", this.ax + 40, 120, "#ff2a6d"); g.audio.sfx("warn"); }
    }
    if (this.sweep) {
      const s = this.sweep; s.t++;
      if (s.t > 60) { s.y = Math.min(FLOOR - 26, s.y + 1.3); if (s.t % 10 === 0) g.audio.sfx("beam"); g.shake = 2; if (overlap({ x: this.ax, y: s.y, w: this.x0 - this.ax, h: 10 }, p)) p.hurt(g); }
      if (s.t > 260) this.sweep = null;
    }
  }
  hit() { return this.phase === 3 ? [{ x: this.coreX - 16, y: this.coreY - 16, w: 32, h: 32, weak: true }] : [{ x: this.x0 + 4, y: 20, w: 160, h: FLOOR - 20 }]; }
  override hurt() { const b = [{ x: this.x0 + 8, y: 20, w: 160, h: FLOOR - 20 }]; if (this.arm.t > 30 && this.arm.t < 70) b.push({ x: this.arm.tx - 12, y: FLOOR - 30, w: 24, h: 30 }); return b; }
  drawBg(c: Ctx, cx: number) {
    for (const q of this.rams) if (q.on) drawRam(c, q.x - cx, q.y, this.t);
  }
  draw(c: Ctx, cx: number) {
    const x = Math.round(this.x0 - cx), f = FLOOR, t = this.t, hot = this.phase >= 2, bulge = Math.min(this.eaten, 6);
    // cables
    for (let i = 0; i < 5; i++) line(c, x + 10 + i * 6, f - 20, x - 20 - i * 18, f, 4, ["#3a3150", "#ff2a6d", "#2a5a8a", "#5a6275", "#7a2a6a"][i]);
    // RAM stuffed on top (more as it eats)
    for (let i = 0; i < 6 + bulge; i++) { const rx = x + 14 + i * (150 / (6 + bulge)), ry = 2 - (i % 2) * 6; R(c, rx, ry, 11, 30, "#1f7a3a"); R(c, rx + 2, ry + 4, 7, 5, "#111"); R(c, rx + 2, ry + 14, 7, 5, "#111"); R(c, rx, ry + 27, 11, 3, "#ffc845"); }
    // chassis
    R(c, x, 18, 172, f - 18, "#1d1f2c"); R(c, x + 4, 22, 164, f - 26, hot && t % 20 < 10 ? "#3a1c24" : "#2b2d3a");
    R(c, x, 18, 172, 3, "#5a6275");
    for (let i = 0; i < 6; i++) R(c, x + 4, 40 + i * 24, 164, 1, "#1d1f2c");
    txt(c, "HOG-9000", x + 96, 26, "#ff2a6d", 6, "left", null);
    // monitor face
    R(c, x + 30, 38, 76, 50, "#05070d"); R(c, x + 33, 41, 70, 44, hot ? "#2a0510" : "#04202a");
    const fc = this.phase === 3 ? (t % 6 < 3 ? "#ffd21f" : "#ff2a6d") : hot ? "#ff3a3a" : "#5fe3ff";
    const gl = this.phase === 3 ? Math.round((Math.random() - 0.5) * 4) : 0;
    if (this.phase === 1) { R(c, x + 46 + gl, 54, 10, 3, fc); R(c, x + 80, 54, 10, 3, fc); R(c, x + 44, 50, 4, 4, fc); R(c, x + 88, 50, 4, 4, fc); }
    else { line(c, x + 44, 50, x + 56, 56, 3, fc); line(c, x + 92, 50, x + 80, 56, 3, fc); R(c, x + 48 + gl, 56, 6, 5, fc); R(c, x + 82 - gl, 56, 6, 5, fc); }
    const mo = this.mt % 140 > 30 && this.mt % 140 < 50 ? 6 : 2;
    R(c, x + 50, 70, 36, mo, fc); for (let i = 0; i < 5; i++) R(c, x + 52 + i * 7, 70, 3, 3, "#05070d");
    for (let i = 0; i < 22; i++) R(c, x + 33, 41 + i * 2, 70, 1, "rgba(0,0,0,0.3)");
    // fans
    for (let i = 0; i < 3; i++) {
      const fx = x + 136, fy = 50 + i * 40;
      disc(c, fx, fy, 15, "#14151e"); ring(c, fx, fy, 15, "#5a6275", 24, 2);
      for (let b = 0; b < 4; b++) { const a = this.fan + b * Math.PI / 2 + i; line(c, fx, fy, fx + Math.cos(a) * 12, fy + Math.sin(a) * 12, 3, hot ? "#ff6a4a" : "#9aa3b5"); }
      disc(c, fx, fy, 3, "#ffd21f");
    }
    // hard drives
    for (let i = 0; i < 2; i++) { const hx = x + 110, hy = 112 + i * 30; R(c, hx - 2, hy - 2, 46, 26, "#14151e"); disc(c, hx + 14, hy + 11, 10, "#c8ccd8"); disc(c, hx + 14, hy + 11, 2, "#333"); const a = t * (hot ? 0.3 : 0.1) + i; line(c, hx + 34, hy + 4, hx + 14 + Math.cos(a) * 7, hy + 11 + Math.sin(a) * 7, 2, "#ffd21f"); R(c, hx + 32, hy + 18, 4, 2, t % 8 < 4 ? "#ff2a2a" : "#400"); }
    // core
    const kx = this.coreX - cx, ky = this.coreY;
    if (this.phase < 3) { R(c, kx - 22, ky - 20, 44, 40, "#4a4e60"); for (let i = 0; i < 6; i++) R(c, kx - 20, ky - 18 + i * 7, 40, 3, "#2b2d3a"); R(c, kx - 4, ky - 4, 8, 8, hot ? "#ff3a3a" : "#5fe3ff"); }
    else {
      const pr = 12 + Math.sin(t * 0.3) * 3;
      R(c, kx - 20, ky - 20, 40, 40, "#3a2a10"); for (let i = 0; i < 8; i++) { R(c, kx - 18 + i * 5, ky - 24, 2, 4, "#ffc845"); R(c, kx - 18 + i * 5, ky + 20, 2, 4, "#ffc845"); }
      disc(c, kx, ky, pr + 4, "#ff2a6d"); disc(c, kx, ky, pr, "#ffb0d0"); disc(c, kx, ky, pr - 5, "#ffffff");
      if (t % 3 === 0) this.g.parts.push({ x: this.coreX, y: ky, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 18, col: "#ff2a6d", s: 2, g: 0 });
    }
    // turrets
    for (const ty of [70, 150]) { R(c, x - 6, ty - 6, 14, 12, "#5a6275"); const a = Math.atan2(this.p.y + 10 - ty, this.p.x - (this.x0 + 0)); line(c, x, ty, x + Math.cos(a) * 12, ty + Math.sin(a) * 12, 4, "#1a1426"); R(c, x - 2, ty - 2, 4, 4, "#ff2a2a"); }
    // arm
    const sx = x + 10, sy = 100;
    let hx: number, hy: number;
    if (this.arm.t > 0) { const k = this.arm.t < 40 ? this.arm.t / 40 : 1; hx = this.arm.tx - cx; hy = this.arm.t < 40 ? 40 + Math.sin(t * 0.5) * 3 : this.arm.t < 50 ? 40 + (this.arm.t - 40) * 13 : f - 14; void k; }
    else { hx = sx - 40 + Math.sin(t * 0.03) * 10; hy = sy + 30 + Math.cos(t * 0.04) * 10; }
    const mx = (sx + hx) / 2, my = Math.min(sy, hy) - 30;
    line(c, sx, sy, mx, my, 6, "#5a6275"); line(c, mx, my, hx, hy, 5, "#9aa3b5"); disc(c, mx, my, 4, "#ffd21f");
    R(c, hx - 10, hy - 4, 20, 12, "#3a3150"); R(c, hx - 10, hy + 6, 4, 6, "#9aa3b5"); R(c, hx + 6, hy + 6, 4, 6, "#9aa3b5");
    // vents & sweep & beam
    for (const v of this.vents) {
      const vx = v.x - cx;
      if (v.t < 50) { if (v.t % 6 < 3) R(c, vx - 7, f - 3, 14, 3, "#ff8a00"); this.g.parts.push({ x: v.x + (Math.random() - 0.5) * 10, y: f - 2, vx: 0, vy: -1, life: 14, col: "#c8c8d0", s: 2, g: 0 }); }
      else { R(c, vx - 7, 0, 14, f, "#ff5a1a"); R(c, vx - 4, 0, 8, f, "#ffd27a"); R(c, vx - 1, 0, 2, f, "#fff"); }
    }
    if (this.sweep) {
      const s = this.sweep, sxw = this.x0 - this.ax;
      if (s.t <= 60) { if (s.t % 6 < 3) R(c, this.ax - cx, s.y + 5, sxw, 1, "#ff2a6d"); }
      else { R(c, this.ax - cx, s.y, sxw, 10, "#ff2a6d"); R(c, this.ax - cx, s.y + 3, sxw, 4, "#fff"); }
    }
    this.drawBeam(c, cx); this.flashOver(c, cx);
  }
}
export function drawRam(c: Ctx, x: number, y: number, t: number) {
  x = Math.round(x); y = Math.round(y);
  R(c, x, y, 22, 9, "#1f7a3a"); R(c, x, y, 22, 1, "#3fae5a");
  for (let i = 0; i < 4; i++) R(c, x + 2 + i * 5, y + 2, 4, 4, "#111");
  for (let i = 0; i < 10; i++) R(c, x + 1 + i * 2, y + 8, 1, 2, "#ffc845");
  if (t % 30 < 15) R(c, x + 20, y + 1, 1, 1, "#7dff6a");
}

export function makeBoss(kind: string, g: Game, ax: number): Boss {
  switch (kind) {
    case "harvester": return new Harvester(g, ax);
    case "overseer": return new Overseer(g, ax);
    case "enforcer": return new Enforcer(g, ax);
    case "warden": return new Warden(g, ax);
    default: return new Hog(g, ax);
  }
}
