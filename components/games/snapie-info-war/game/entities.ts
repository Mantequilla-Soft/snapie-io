// @ts-nocheck — gameplay entities: physics bodies, player, enemies, weapons.
import { clamp, overlap, ROWS, T, W, type Box } from "./core";
import type { EType, LevelData } from "./levels";
import type { Game } from "./game";

export type WeaponId = "sting" | "laser" | "spread" | "bazooka";
export const WEAP: Record<WeaponId, { name: string; letter: string; col: string }> = {
  sting: { name: "STING", letter: "T", col: "#ffd21f" },
  laser: { name: "LASER", letter: "L", col: "#5fe3ff" },
  spread: { name: "SPREAD", letter: "S", col: "#ff4d6d" },
  bazooka: { name: "BAZOOKA", letter: "B", col: "#7dff6a" },
};
export const LETTER: Record<string, WeaponId> = { T: "sting", L: "laser", S: "spread", B: "bazooka" };

export interface Mover { x: number; y: number; w: number; ox: number; oy: number; ax: number; ay: number; range: number; speed: number; t: number; dx: number; dy: number }
export interface Body { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; ground: number; ride: Mover | null; drop: number }
export interface PB { x: number; y: number; vx: number; vy: number; life: number; dmg: number; k: WeaponId; pierce: boolean; hits: Set<unknown>; r: number; lvl: number; t: number; dead?: boolean }
export interface EB { x: number; y: number; vx: number; vy: number; r: number; k: string; life: number; t: number; g?: number; dead?: boolean }

export function tileAt(lv: LevelData, c: number, r: number) {
  if (c < 0 || c >= lv.cols) return 1;
  if (r < 0 || r >= ROWS) return 0;
  return lv.tiles[r * lv.cols + c];
}
export const isSolid = (t: number) => t === 1 || t >= 3;
export function groundTop(lv: LevelData, x: number) {
  const c = Math.floor(x / T);
  for (let r = 0; r < ROWS; r++) { const t = tileAt(lv, c, r); if (t) return r * T; }
  return null;
}
export function moveBody(g: Game, b: Body): boolean {
  const lv = g.lv; let wall = false;
  if (b.ride) { b.x += b.ride.dx; b.y = b.ride.y - b.h; }
  b.x += b.vx;
  const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
  if (b.vx > 0) {
    const c = Math.floor((b.x + b.w - 0.01) / T);
    for (let r = r0; r <= r1; r++) if (isSolid(tileAt(lv, c, r))) { b.x = c * T - b.w; wall = true; break; }
  } else if (b.vx < 0) {
    const c = Math.floor(b.x / T);
    for (let r = r0; r <= r1; r++) if (isSolid(tileAt(lv, c, r))) { b.x = (c + 1) * T; wall = true; break; }
  }
  const prevB = b.y + b.h; b.y += b.vy; b.onGround = false; b.ride = null;
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  if (b.vy >= 0) {
    const r = Math.floor((b.y + b.h - 0.01) / T);
    for (let c = c0; c <= c1; c++) {
      const t = tileAt(lv, c, r);
      if (isSolid(t) || (t === 2 && b.drop <= 0 && prevB <= r * T + 0.5)) { b.y = r * T - b.h; b.vy = 0; b.onGround = true; b.ground = t; break; }
    }
    if (!b.onGround) for (const m of g.movers) {
      if (b.x + b.w > m.x && b.x < m.x + m.w && prevB <= m.y + 1.5 && b.y + b.h >= m.y) { b.y = m.y - b.h; b.vy = 0; b.onGround = true; b.ground = 6; b.ride = m; break; }
    }
  } else {
    const r = Math.floor(b.y / T);
    for (let c = c0; c <= c1; c++) if (isSolid(tileAt(lv, c, r))) { b.y = (r + 1) * T; b.vy = 0; break; }
  }
  return wall;
}

export class Player implements Body {
  x = 40; y = 100; w = 10; h = 22; vx = 0; vy = 0; onGround = false; ground = 0; ride: Mover | null = null; drop = 0;
  face = 1; hp = 5; maxHp = 5; inv = 0; hurtT = 0; dead = false; deathT = 0; crouch = false; aimX = 1; aimY = 0;
  cd = 0; shootT = 0; runT = 0; coyote = 0; jbuf = 0; recoil = 0; pickT = 0; switchT = 0; t = 0;
  weapons: { id: WeaponId; lvl: number }[] = [{ id: "sting", lvl: 1 }]; wi = 0; parasite: Enemy | null = null;
  get wpn() { return this.weapons[this.wi]; }
  shoulder() { return { x: this.x + this.w / 2 + this.face * 1, y: this.y + this.h - (this.crouch ? 7 : 14) }; }
  update(g: Game) {
    this.t++;
    if (this.dead) {
      this.deathT++; this.vy = Math.min(this.vy + 0.25, 5); this.x += this.vx;
      const gt = groundTop(g.lv, this.x + 5);
      if (gt !== null && this.y + this.h + this.vy >= gt && this.vy > 0 && this.y < gt) { this.y = gt - this.h; this.vy = 0; this.vx *= 0.5; } else this.y += this.vy;
      if (this.deathT === 110) g.onPlayerDeathDone();
      return;
    }
    const I = g.input, L = I.is("left"), Rt = I.is("right"), U = I.is("up"), D = I.is("down");
    const dir = (Rt ? 1 : 0) - (L ? 1 : 0);
    if (dir) this.face = dir;
    this.crouch = D && this.onGround && dir === 0;
    const standUp = U && this.onGround && dir === 0;
    let ax = dir || this.face, ay = 0;
    if (U) { ay = -1; if (!dir) ax = 0; }
    else if (D) { if (!this.onGround) { ay = 1; if (!dir) ax = 0; } else if (dir) ay = 1; }
    const n = Math.hypot(ax, ay); this.aimX = ax / n; this.aimY = ay / n;

    const spd = 1.7 * (this.parasite ? 0.5 : 1);
    this.vx = this.crouch || standUp ? 0 : dir * spd;
    if (this.onGround && this.ground === 4) this.vx += 0.9;
    if (this.onGround && this.ground === 5) this.vx -= 0.9;
    if (this.recoil > 0.05) { this.vx -= this.face * this.recoil; this.recoil *= 0.72; } else this.recoil = 0;
    if (this.hurtT > 8) this.vx = -this.face * 1.2;

    if (I.hit("jump")) this.jbuf = 6; else if (this.jbuf > 0) this.jbuf--;
    if (this.onGround) this.coyote = 6; else if (this.coyote > 0) this.coyote--;
    if (this.jbuf > 0 && this.coyote > 0) {
      if (D && this.ground === 2) { this.drop = 12; this.y += 2; }
      else { this.vy = this.parasite ? -4.6 : -5.6; g.audio.sfx("jump"); }
      this.jbuf = 0; this.coyote = 0; this.ride = null;
    }
    if (!I.is("jump") && this.vy < -2.2) this.vy += 0.35;
    this.vy = Math.min(this.vy + 0.3, 6);
    if (this.drop > 0) this.drop--;
    const nh = this.crouch ? 14 : 22;
    if (nh !== this.h) { this.y += this.h - nh; this.h = nh; }
    moveBody(g, this);
    this.x = clamp(this.x, g.camX + 2, g.camX + W - this.w - 2);
    if (this.onGround && this.vx !== 0) this.runT++;
    if (!this.onGround) this.runT = 0;
    if (this.onGround && this.ground === 3) this.hurt(g);
    if (this.y > ROWS * T + 24) { this.kill(g); return; }

    if (this.cd > 0) this.cd--;
    if (this.shootT > 0) this.shootT--;
    if (I.is("shoot") && this.cd <= 0) fire(g, this);
    if (I.hit("switch") && this.weapons.length > 1) { this.wi = (this.wi + 1) % this.weapons.length; this.switchT = 50; g.audio.sfx("switch"); }
    if (this.inv > 0) this.inv--;
    if (this.hurtT > 0) this.hurtT--;
    if (this.pickT > 0) this.pickT--;
    if (this.switchT > 0) this.switchT--;
    if (this.parasite && this.parasite.dead) this.parasite = null;
  }
  hurt(g: Game, n = 1) {
    if (this.inv > 0 || this.dead || g.state !== "play") return;
    this.hp -= n; this.inv = 75; this.hurtT = 16; this.vy = Math.min(this.vy, -2);
    g.audio.sfx("hurt"); g.shake = Math.max(g.shake, 3);
    g.sparks(this.x + 5, this.y + 8, "#ffd21f", 8);
    if (this.hp <= 0) this.kill(g);
  }
  kill(g: Game) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0; this.hp = 0; this.vy = -4.5; this.vx = -this.face * 1.3; this.h = 22; this.crouch = false;
    if (this.parasite) { this.parasite.dead = true; this.parasite = null; }
    g.audio.sfx("die"); g.boom(this.x + 5, this.y + 10, 1.4); g.shake = 6;
  }
}

export function fire(g: Game, p: Player) {
  const w = p.wpn, s = p.shoulder(), mx = s.x + p.aimX * 11, my = s.y + p.aimY * 11, ang = Math.atan2(p.aimY, p.aimX);
  const add = (a: number, sp: number, o: Partial<PB>) =>
    g.pb.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 40, dmg: 1, k: w.id, pierce: false, hits: new Set(), r: 2, lvl: w.lvl, t: 0, ...o });
  switch (w.id) {
    case "sting": { const n = 2 + w.lvl; for (let i = 0; i < n; i++) add(ang + (i - (n - 1) / 2) * 0.09 + (Math.random() - 0.5) * 0.05, 5 + Math.random(), { life: 20 + w.lvl * 6 }); p.cd = 9; g.audio.sfx("sting"); break; }
    case "laser": add(ang, 9, { life: 48, dmg: 2 + w.lvl, pierce: true, r: 3 }); p.cd = 17 - w.lvl * 3; g.audio.sfx("laser"); break;
    case "spread": { const n = [3, 5, 7][w.lvl - 1]; for (let i = 0; i < n; i++) add(ang + (i - (n - 1) / 2) * 0.15, 4.2, { life: 80, r: 3 }); p.cd = 13; g.audio.sfx("spread"); break; }
    case "bazooka": add(ang, 2.2, { life: 110, dmg: 5 + w.lvl * 2, r: 4 }); p.cd = 44 - w.lvl * 6; p.recoil = 1.8; g.shake = Math.max(g.shake, 3); g.audio.sfx("bazooka"); break;
  }
  p.shootT = 8;
  g.parts.push({ x: mx, y: my, vx: 0, vy: 0, life: 4, col: "#fff6c0", s: 5, g: 0 });
  if (p.parasite) p.parasite.damage(g, 1);
}

const ED: Record<EType, { w: number; h: number; hp: number; score: number; fly: boolean }> = {
  drone: { w: 14, h: 10, hp: 2, score: 100, fly: true }, term: { w: 12, h: 22, hp: 4, score: 200, fly: false },
  dog: { w: 20, h: 12, hp: 2, score: 150, fly: false }, orb: { w: 14, h: 14, hp: 4, score: 300, fly: true },
  para: { w: 10, h: 8, hp: 3, score: 250, fly: false }, turret: { w: 14, h: 14, hp: 6, score: 400, fly: true },
  ram: { w: 22, h: 8, hp: 3, score: 300, fly: true },
};
export class Enemy implements Body {
  x: number; y: number; w: number; h: number; vx = 0; vy = 0; onGround = false; ground = 0; ride: Mover | null = null; drop = 0;
  hp: number; maxHp: number; score: number; fly: boolean; t = 0; flash = 0; face = -1; st = 0; timer = 0; dead = false; attached = false; baseY: number; tx = 0; ty = 0;
  constructor(public type: EType, x: number, y: number) {
    const d = ED[type]; this.w = d.w; this.h = d.h; this.hp = this.maxHp = d.hp; this.score = d.score; this.fly = d.fly;
    this.x = x; this.y = y; this.baseY = y; this.t = Math.floor(Math.random() * 60);
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  onScreen(g: Game) { return this.x + this.w > g.camX && this.x < g.camX + W; }
  update(g: Game) {
    this.t++; if (this.flash > 0) this.flash--; if (this.st > 0) this.st--;
    const p = g.player, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2, cx = this.cx, cy = this.cy;
    switch (this.type) {
      case "drone": {
        this.face = pcx < cx ? -1 : 1;
        const tx = pcx + (cx > pcx ? 60 : -60), ty = Math.min(pcy - 60, 130) + Math.sin(this.t * 0.06) * 12;
        this.vx = clamp(this.vx + clamp((tx - cx) * 0.004, -0.07, 0.07), -1.4, 1.4); this.vy = (ty - cy) * 0.03;
        this.x += this.vx; this.y += this.vy;
        if (this.t % 120 === 0 && this.onScreen(g) && !p.dead) { g.eshoot(cx, cy + 5, pcx, pcy, 1.8); this.st = 10; }
        break;
      }
      case "term": {
        this.vy = Math.min(this.vy + 0.3, 6);
        if (this.timer > 0) {
          this.timer--; this.vx = 0;
          if (this.timer === 18) { g.eb.push({ x: cx + this.face * 9, y: this.y + 9, vx: this.face * 2.3, vy: 0, r: 2, k: "orb", life: 200, t: 0 }); this.st = 10; }
        } else {
          this.face = pcx < cx ? -1 : 1; this.vx = this.face * 0.6;
          if (Math.abs(pcx - cx) < 200 && this.t % 130 === 0 && this.onScreen(g)) this.timer = 40;
        }
        if (moveBody(g, this) && this.onGround) this.vy = -4.6;
        break;
      }
      case "dog": {
        this.vy = Math.min(this.vy + 0.3, 6);
        if (this.timer > 0) this.timer--;
        if (this.onGround) {
          if (Math.abs(pcx - cx) > 110 && Math.sign(pcx - cx) !== this.face) this.face = -this.face;
          this.vx = this.face * 2.3;
          if (Math.abs(pcx - cx) < 64 && this.timer <= 0 && Math.sign(pcx - cx) === this.face) { this.vy = -4.4; this.timer = 70; this.st = 12; }
        }
        if (this.t < 2) this.face = pcx < cx ? -1 : 1;
        if (moveBody(g, this) && this.onGround) this.vy = -4.8;
        break;
      }
      case "orb": {
        if (this.st > 0) { // charging pause
          if (this.st === 1) { for (let i = -1; i <= 1; i++) { const a = Math.atan2(pcy - cy, pcx - cx) + i * 0.3; g.eb.push({ x: cx, y: cy, vx: Math.cos(a) * 1.9, vy: Math.sin(a) * 1.9, r: 3, k: "orb", life: 220, t: 0 }); } g.audio.sfx("bossatk"); }
        } else {
          if (this.t % 50 === 0) { this.tx = (Math.random() - 0.5) * 1.6 + Math.sign(pcx - cx) * 0.5; this.ty = (Math.random() - 0.5) * 3; }
          this.x += this.tx; this.y += this.ty + Math.sin(this.t * 0.11) * 0.9;
          this.y = clamp(this.y, 20, 150);
          if (this.t % 160 === 0 && this.onScreen(g)) this.st = 40;
        }
        break;
      }
      case "para": {
        if (this.attached) {
          if (p.dead) { this.dead = true; break; }
          this.x = p.x + p.w / 2 - this.w / 2 - p.face * 3; this.y = p.y + 1;
          this.timer++;
          if (this.timer % 20 === 0) g.audio.sfx("chomp");
          if (this.timer % 8 === 0) g.parts.push({ x: this.cx, y: this.y, vx: (Math.random() - 0.5) * 1.5, vy: -1.2, life: 26, col: "#7dff6a", s: 2, g: 0, glyph: Math.random() < 0.5 ? "0" : "1" });
          if (this.timer % 110 === 0) { p.hp -= 1; p.hurtT = 6; g.audio.sfx("hurt"); if (p.hp <= 0) p.kill(g); }
          break;
        }
        this.vy = Math.min(this.vy + 0.3, 6);
        if (this.timer > 0) this.timer--;
        this.face = pcx < cx ? -1 : 1;
        if (this.onGround) { this.vx *= 0.7; if (this.timer <= 0) { this.vy = -3.4; this.vx = this.face * 1.6; this.timer = 34; } }
        moveBody(g, this);
        if (!p.dead && !p.parasite && p.inv <= 0 && overlap(this, p)) { this.attached = true; p.parasite = this; this.timer = 0; g.audio.sfx("chomp"); g.addText("PARASITE! SHOOT IT OFF", p.x - 40, p.y - 20, "#7dff6a"); }
        break;
      }
      case "turret": {
        if (this.t < 2 && this.baseY >= 0) { this.y = this.baseY - this.h; this.baseY = -1; }
        this.tx = Math.atan2(pcy - cy, pcx - cx);
        if (this.t % 100 === 0 && this.onScreen(g) && Math.abs(pcx - cx) < 300 && !p.dead) { g.eshoot(cx + Math.cos(this.tx) * 9, cy + Math.sin(this.tx) * 9, pcx, pcy, 2); this.st = 8; }
        break;
      }
      case "ram": {
        const b = g.boss as any; if (!b || b.dead) { this.dead = true; break; }
        const tx = b.coreX, ty = b.coreY, a = Math.atan2(ty - cy, tx - cx);
        this.x += Math.cos(a) * 0.9; this.y += Math.sin(a) * 0.9;
        if (Math.hypot(tx - cx, ty - cy) < 10) { this.dead = true; b.absorb(); }
        break;
      }
    }
    if (!this.fly && this.y > ROWS * T + 30) this.dead = true;
    if (this.type !== "para" && this.type !== "ram" && !p.dead && overlap(this, p)) p.hurt(g);
  }
  damage(g: Game, n: number) {
    if (this.dead) return;
    this.hp -= n; this.flash = 4; g.audio.sfx("hit");
    if (this.hp <= 0) {
      this.dead = true; g.score += this.score; g.addText(String(this.score), this.cx - 8, this.y - 6, "#fff");
      g.boom(this.cx, this.cy, this.type === "turret" ? 1.5 : 1); g.audio.sfx("edie");
      if (this.attached) g.player.parasite = null;
      if (this.type !== "ram" && Math.random() < 0.07) g.spawnItem(this.cx, this.cy, Math.random() < 0.4 ? "H" : "TLSB"[Math.floor(Math.random() * 4)]);
    }
  }
}
export function makeMover(d: { x: number; y: number; w: number; ax: number; ay: number; range: number; speed: number }): Mover {
  return { ...d, ox: d.x, oy: d.y, t: 0, dx: 0, dy: 0 };
}
export type { Box };
