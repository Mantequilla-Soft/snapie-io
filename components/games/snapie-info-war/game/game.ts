// @ts-nocheck — game state machine, simulation loop, HUD and screens.
import { W, H, T, R, line, disc, ring, txt, clamp, overlap, rnd, Input, type Ctx } from "./core";
import { audio } from "./audio";
import { buildLevel, WORLD_COUNT, type EType, type LevelData } from "./levels";
import { Player, Enemy, moveBody, groundTop, tileAt, isSolid, makeMover, WEAP, LETTER, type PB, type EB, type Mover } from "./entities";
import { makeBoss, Hog, type Boss } from "./bosses";
import { drawBG, drawTiles, drawMover, drawLaser, drawFaller, laserOn } from "./world";
import { drawPlayer, drawEnemy, drawPB, drawEB, drawFX, drawItem, drawCap, drawSnapie, type FX } from "./sprites";

type State = "title" | "options" | "controls" | "intro" | "card" | "play" | "pause" | "clear" | "gameover" | "ending";
interface Part { x: number; y: number; vx: number; vy: number; life: number; col: string; s: number; g: number; glyph?: string }
const NODES = ["FARM", "FACTORY", "CITY", "SERVERS", "CORE", "HOG"];
const INTRO = ["THE ROBOTS HAD BUILT AN", "INCREDIBLE NETWORK.", "THEN SOMEONE TOOK ALL", "THE INFORMATION.", "NOW THE MACHINES", "ARE STARVING.", "ONE LITTLE BEE DECIDED", "HE'D HAD ENOUGH."];

export class Game {
  c: Ctx; input: Input; audio = audio; hooks: Record<string, (d?: any) => void> = {}; menus = true; cleared = 0;
  state: State = "title"; st = 0; t = 0; menu = 0; back: State = "title";
  settings = { music: true, sfx: true, diff: 1 }; saved = 0; hi = 0;
  world = 0; lv: LevelData; camX = 0; locked = false; shake = 0; flashT = 0; banner = 0;
  player = new Player(); enemies: Enemy[] = []; pb: PB[] = []; eb: EB[] = []; parts: Part[] = []; fx: FX[] = [];
  items: any[] = []; caps: any[] = []; movers: Mover[] = []; lasers: any[] = []; fallers: any[] = []; texts: any[] = []; bgPuffs: any[] = [];
  boss: Boss | null = null; score = 0; lives = 3; cpX = 40; titleLv: LevelData;

  constructor(canvas: HTMLCanvasElement, keyboard = true) {
    this.input = new Input(keyboard);
    this.c = canvas.getContext("2d")!; this.c.imageSmoothingEnabled = false;
    try { const s = JSON.parse(localStorage.getItem("snapie_save") || "{}"); this.saved = s.saved || 0; this.hi = s.hi || 0; if (s.settings) this.settings = s.settings; } catch { /* ignore */ }
    this.titleLv = buildLevel(4); this.lv = this.titleLv;
  }
  persist() { try { localStorage.setItem("snapie_save", JSON.stringify({ saved: this.saved, hi: Math.max(this.hi, this.score), settings: this.settings })); } catch { /* ignore */ } }

  // ---------- helpers used by entities ----------
  boom(x: number, y: number, s = 1) { this.fx.push({ x, y, t: 0, s }); this.sparks(x, y, "#ffb000", Math.round(6 * s)); if (s >= 2) this.shake = Math.max(this.shake, 5); }
  sparks(x: number, y: number, col: string, n: number) { for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: rnd(-2, 2), vy: rnd(-2.5, 1), life: 14 + Math.random() * 12, col, s: 2, g: 0.12 }); }
  eshoot(x: number, y: number, tx: number, ty: number, sp: number) { const a = Math.atan2(ty - y, tx - x); this.eb.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2.5, k: "orb", life: 260, t: 0 }); }
  addText(s: string, x: number, y: number, col = "#fff") { this.texts.push({ s, x, y, col, t: 0 }); }
  spawnItem(x: number, y: number, item: string) { this.items.push({ x: x - 6, y: y - 6, w: 12, h: 12, vx: 0, vy: -3, onGround: false, ground: 0, ride: null, drop: 0, item, t: 0, fixed: false }); }
  spawnEnemy(type: EType, x: number, y: number) {
    const e = new Enemy(type, x, 0);
    if (type === "turret") { const gy = y < 0 ? groundTop(this.lv, x + 7) ?? 160 : y; e.y = gy - e.h; e.baseY = -1; }
    else if (type === "ram") { e.y = y; }
    else if (e.fly) e.y = y < 0 ? 60 : y - e.h / 2;
    else if (y < 0) { const gt = groundTop(this.lv, x + e.w / 2); if (gt === null) return; e.y = gt - e.h; }
    else e.y = y - e.h;
    this.enemies.push(e);
  }

  // ---------- flow ----------
  newGame(w: number) {
    const d = this.settings.diff;
    this.score = 0; this.lives = [4, 3, 2][d]; this.player = new Player(); this.player.maxHp = [7, 5, 3][d];
    this.loadWorld(w); this.state = w === 0 && this.menus ? "intro" : "card"; this.st = 0; this.cleared = 0; this.hooks.runStart?.();
  }
  loadWorld(w: number) {
    this.world = w; this.lv = buildLevel(w);
    this.enemies = []; this.pb = []; this.eb = []; this.parts = []; this.fx = []; this.texts = []; this.bgPuffs = [];
    this.movers = this.lv.movers.map(makeMover); this.lasers = this.lv.lasers;
    this.fallers = this.lv.fallers.map((f) => ({ x: f.x, y: 4, vy: 0, st: 0, t: 0, w: 20, h: 14 }));
    this.caps = this.lv.caps.map((c) => ({ ...c, baseY: c.y, t: Math.random() * 100 }));
    this.items = this.lv.items.map((i) => ({ x: i.x, y: i.y, w: 12, h: 12, item: i.item, t: 0, fixed: true }));
    this.camX = 0; this.locked = false; this.boss = null; this.cpX = 40; this.banner = 0;
    this.placePlayer(40);
  }
  placePlayer(x: number) {
    const p = this.player; let gx = x, gt = groundTop(this.lv, gx + 5);
    while (gt === null && gx < this.lv.cols * T) { gx += 8; gt = groundTop(this.lv, gx + 5); }
    Object.assign(p, { x: gx, y: (gt ?? 160) - 22, h: 22, vx: 0, vy: 0, dead: false, deathT: 0, hp: p.maxHp, inv: 120, hurtT: 0, parasite: null, ride: null, crouch: false, face: 1, recoil: 0 });
  }
  onPlayerDeathDone() {
    this.lives--;
    if (this.lives < 0) { this.state = "gameover"; this.menu = 0; this.st = 0; this.hi = Math.max(this.hi, this.score); this.persist(); this.hooks.gameOver?.(); return; }
    const p = this.player, w = p.wpn;
    if (w.lvl > 1) w.lvl--; else if (w.id !== "sting") { p.weapons.splice(p.wi, 1); p.wi = 0; }
    this.camX = this.locked ? this.lv.arenaX : clamp(this.cpX - 60, 0, this.lv.arenaX);
    this.enemies = this.enemies.filter((e) => this.locked && e.type === "ram"); this.eb = []; this.pb = [];
    for (const s of this.lv.spawns) if (s.x > this.camX + W) s.done = false;
    this.placePlayer(Math.max(this.cpX, this.camX + 24));
  }
  bossDefeated() {
    this.eb = [];
    if (this.world < WORLD_COUNT - 1) { this.state = "clear"; this.st = 0; this.audio.sfx("clear"); this.saved = Math.max(this.saved, this.world + 1); this.score += 5000; }
    else { this.state = "ending"; this.st = 0; this.saved = 0; }
    this.cleared++; this.hi = Math.max(this.hi, this.score); this.persist();
    if (this.state === "ending") this.hooks.win?.(); else this.hooks.stageClear?.();
  }
  track(): string | null {
    switch (this.state) {
      case "title": case "options": case "controls": case "intro": return "title";
      case "play": case "pause": if (this.boss) return this.boss.dead ? null : this.world === 4 ? "hog" : "boss"; return "w" + (this.world + 1);
      case "ending": return this.st > 240 ? "end" : null;
      default: return null;
    }
  }

  // ---------- main step ----------
  step() {
    this.t++; const I = this.input;
    this.audio.musicOn = this.settings.music; this.audio.sfxOn = this.settings.sfx;
    switch (this.state) {
      case "title": {
        if (!this.menus) { this.lv = this.titleLv; this.camX = this.t * 0.6; break; }
        this.lv = this.titleLv; this.camX = this.t * 0.6;
        if (I.hit("up")) { this.menu = (this.menu + 2) % 3; this.audio.sfx("select"); }
        if (I.hit("down")) { this.menu = (this.menu + 1) % 3; this.audio.sfx("select"); }
        if (I.confirm()) {
          this.audio.sfx("select");
          if (this.menu === 0) this.newGame(0);
          else if (this.menu === 1) { if (this.saved > 0) this.newGame(this.saved); else this.addText("", 0, 0); }
          else { this.state = "options"; this.menu = 0; }
        }
        break;
      }
      case "options": {
        if (I.hit("up")) { this.menu = (this.menu + 4) % 5; this.audio.sfx("select"); }
        if (I.hit("down")) { this.menu = (this.menu + 1) % 5; this.audio.sfx("select"); }
        const ch = I.confirm() || I.hit("left") || I.hit("right");
        if (ch) {
          this.audio.sfx("select");
          if (this.menu === 0) this.settings.music = !this.settings.music;
          if (this.menu === 1) this.settings.sfx = !this.settings.sfx;
          if (this.menu === 2) this.settings.diff = (this.settings.diff + (I.hit("left") ? 2 : 1)) % 3;
          if (this.menu === 3 && I.confirm()) { this.back = "options"; this.state = "controls"; }
          if (this.menu === 4 && I.confirm()) { this.state = "title"; this.menu = 2; }
          this.persist();
        }
        if (I.hit("pause")) { this.state = "title"; this.menu = 2; }
        break;
      }
      case "controls": if (I.confirm() || I.hit("pause")) { this.state = this.back; this.audio.sfx("select"); } break;
      case "intro": this.st++; if (I.hit("start") || this.st > 4 * 180 + 150) { this.state = "card"; this.st = 0; } break;
      case "card": this.st++; if (this.st > 170 || (this.st > 30 && I.confirm())) { this.state = "play"; this.st = 0; } break;
      case "play": this.updatePlay(); if (I.hit("pause")) { this.state = "pause"; this.audio.sfx("select"); } break;
      case "pause": if (I.hit("pause") || I.hit("start")) this.state = "play"; break;
      case "clear": this.st++; this.tickFx(); if (this.st > 280 || (this.st > 90 && I.hit("start"))) { this.loadWorld(this.world + 1); this.state = "card"; this.st = 0; } break;
      case "gameover":
        this.st++;
        if (I.hit("up") || I.hit("down")) { this.menu = 1 - this.menu; this.audio.sfx("select"); }
        if (this.menus && this.st > 40 && I.confirm()) { this.audio.sfx("select"); if (this.menu === 0) { this.newGame(this.world); this.state = "card"; } else { this.state = "title"; this.menu = 0; } }
        break;
      case "ending":
        this.st++; this.tickFx();
        if (this.st < 200 && this.st % 6 === 0 && this.boss) { const hb = (this.boss as Hog).x0; this.boom(hb + Math.random() * 170, 20 + Math.random() * 150, 1 + Math.random() * 2); this.audio.sfx("boom"); this.shake = 6; }
        this.shake *= 0.9;
        if (this.menus && this.st > 1150 && I.confirm()) { this.state = "title"; this.menu = 0; }
        break;
    }
    this.audio.music(this.track());
    I.end();
  }
  tickFx() {
    for (const p of this.parts) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.fx) f.t++; this.fx = this.fx.filter((f) => f.t < 26);
    for (const t of this.texts) { t.t++; t.y -= 0.4; } this.texts = this.texts.filter((t) => t.t < 70);
  }
  blast(x: number, y: number, r: number, dmg: number) {
    this.boom(x, y, 2.2); this.audio.sfx("boom"); this.shake = Math.max(this.shake, 5);
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.cx - x, e.cy - y) < r + e.w / 2) e.damage(this, dmg);
    for (const c of this.caps) if (!c.dead && Math.hypot(c.x + 7 - x, c.y - y) < r) this.breakCap(c);
    if (this.boss && !this.boss.dead) for (const b of this.boss.hit()) if (overlap({ x: x - r, y: y - r, w: r * 2, h: r * 2 }, b)) { this.boss.damage(dmg, b.weak); break; }
  }
  breakCap(c: any) { c.dead = true; this.spawnItem(c.x + 7, c.y, c.item); this.boom(c.x + 7, c.y, 1); this.score += 500; this.audio.sfx("edie"); }
  applyItem(it: any) {
    const p = this.player; this.audio.sfx("pickup"); p.pickT = 40; this.score += 1000;
    if (it.item === "H") { p.hp = Math.min(p.maxHp, p.hp + 2); this.addText("REPAIR +2", p.x - 20, p.y - 14, "#ff3b5b"); return; }
    const id = LETTER[it.item]; const ex = p.weapons.findIndex((w) => w.id === id);
    if (ex >= 0) { p.weapons[ex].lvl = Math.min(3, p.weapons[ex].lvl + 1); p.wi = ex; } else { p.weapons.push({ id, lvl: 1 }); p.wi = p.weapons.length - 1; }
    p.switchT = 60; this.addText(`${WEAP[id].name} LV${p.wpn.lvl}`, p.x - 24, p.y - 26, WEAP[id].col);
  }
  updatePlay() {
    const p = this.player, lv = this.lv;
    for (const m of this.movers) { m.t++; const s = Math.sin(m.t * m.speed) * m.range, nx = m.ox + m.ax * s, ny = m.oy + m.ay * s; m.dx = nx - m.x; m.dy = ny - m.y; m.x = nx; m.y = ny; }
    p.update(this);
    if (!this.locked) {
      const tgt = clamp(p.x - W * 0.4, 0, lv.arenaX);
      if (tgt > this.camX) this.camX += Math.min(tgt - this.camX, Math.max(1, (tgt - this.camX) * 0.25));
      if (this.camX >= lv.arenaX - 0.5) { this.camX = lv.arenaX; this.locked = true; this.boss = makeBoss(lv.boss, this, lv.arenaX); this.banner = 160; this.audio.sfx("warn"); this.cpX = lv.arenaX + 8; }
    }
    for (const s of lv.spawns) if (!s.done && s.x < this.camX + W + 16) { s.done = true; if (s.x > this.camX - 16) this.spawnEnemy(s.type, s.x, s.y); }
    for (const cp of lv.checkpoints) if (p.x > cp && cp > this.cpX && !p.dead) { this.cpX = cp; this.addText("CHECKPOINT", cp - 30, 60, "#7dff6a"); this.audio.sfx("check"); }
    for (const e of this.enemies) e.update(this);
    this.enemies = this.enemies.filter((e) => !e.dead && e.x > this.camX - 120 && e.x < this.camX + W + 240);
    // player bullets
    for (const b of this.pb) {
      b.t++;
      if (b.k === "bazooka") { const sp = Math.hypot(b.vx, b.vy); if (sp < 7) { b.vx *= 1.07; b.vy *= 1.07; } if (b.t % 2 === 0) this.parts.push({ x: b.x, y: b.y, vx: -b.vx * 0.1, vy: -0.2, life: 16, col: "#8a8a8a", s: 3, g: -0.01 }); }
      b.x += b.vx; b.y += b.vy; b.life--;
      const out = b.x < this.camX - 10 || b.x > this.camX + W + 10 || b.y < -20 || b.y > H + 20;
      if (b.life <= 0 || out) { b.dead = true; if (b.k === "bazooka" && !out) this.blast(b.x, b.y, 28 + b.lvl * 6, b.dmg); continue; }
      if (isSolid(tileAt(lv, Math.floor(b.x / T), Math.floor(b.y / T)))) { b.dead = true; if (b.k === "bazooka") this.blast(b.x, b.y, 28 + b.lvl * 6, b.dmg); else this.sparks(b.x, b.y, "#fff6c0", 2); continue; }
      const bx = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
      for (const e of this.enemies) {
        if (e.dead || b.hits.has(e) || e.attached || !overlap(bx, e)) continue;
        if (b.k === "bazooka") { this.blast(b.x, b.y, 28 + b.lvl * 6, b.dmg); b.dead = true; break; }
        e.damage(this, b.dmg); this.sparks(b.x, b.y, "#ffffff", 2);
        if (b.pierce) b.hits.add(e); else { b.dead = true; break; }
      }
      if (b.dead) continue;
      for (const c of this.caps) if (!c.dead && overlap(bx, { x: c.x, y: c.y - 4, w: 14, h: 10 })) { this.breakCap(c); b.dead = true; break; }
      if (b.dead || !this.boss || this.boss.dead || b.hits.has(this.boss)) continue;
      for (const hb of this.boss.hit()) if (overlap(bx, hb)) {
        if (b.k === "bazooka") { this.blast(b.x, b.y, 28 + b.lvl * 6, b.dmg); b.dead = true; break; }
        this.boss.damage(b.dmg, hb.weak); this.sparks(b.x, b.y, hb.weak ? "#ff2a6d" : "#ffffff", 3);
        if (b.pierce) b.hits.add(this.boss); else b.dead = true;
        break;
      }
    }
    this.pb = this.pb.filter((b) => !b.dead);
    // enemy bullets
    if (this.boss && this.boss.dead) this.eb = [];
    for (const b of this.eb) {
      b.t++; if (b.g) b.vy += b.g;
      if (b.k === "ping" && b.t < 110) { const a = Math.atan2(p.y + 10 - b.y, p.x + 5 - b.x); b.vx += Math.cos(a) * 0.07; b.vy += Math.sin(a) * 0.07; const s = Math.hypot(b.vx, b.vy); if (s > 2.2) { b.vx *= 2.2 / s; b.vy *= 2.2 / s; } }
      b.x += b.vx; b.y += b.vy; if (b.k === "packet") b.y += Math.sin(b.t * 0.12) * 1.3; b.life--;
      const tl = tileAt(lv, Math.floor(b.x / T), Math.floor((b.y + b.r) / T));
      if (b.k !== "wave" && b.k !== "fire" && isSolid(tl)) {
        b.dead = true;
        if (b.k === "bomb" || b.k === "slag") {
          this.boom(b.x, b.y, 0.9); this.audio.sfx("edie");
          if (Math.hypot(p.x + 5 - b.x, p.y + p.h / 2 - b.y) < 18) p.hurt(this);
          if (b.k === "slag") { const gy = Math.floor((b.y + b.r) / T) * T - 4; for (const d of [-1, 1]) this.eb.push({ x: b.x, y: gy, vx: d * 1.4, vy: 0, r: 4, k: "fire", life: 80, t: 0 }); }
        }
        continue;
      }
      if (!p.dead && overlap({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }, p)) { p.hurt(this); if (b.k !== "wave") b.dead = true; }
      if (b.life <= 0 || b.x < this.camX - 30 || b.x > this.camX + W + 30 || b.y > H + 20 || b.y < -60) b.dead = true;
    }
    this.eb = this.eb.filter((b) => !b.dead);
    // items & capsules
    for (const it of this.items) {
      it.t++;
      if (!it.fixed) { it.vy = Math.min(it.vy + 0.2, 4); moveBody(this, it); if (it.y > H + 30) it.dead = true; }
      if (!p.dead && overlap(it, p)) { it.dead = true; this.applyItem(it); }
      if (it.x < this.camX - 40) it.dead = true;
    }
    this.items = this.items.filter((i) => !i.dead);
    for (const c of this.caps) { c.t++; c.y = c.baseY + Math.sin(c.t * 0.05) * 10; }
    this.caps = this.caps.filter((c) => !c.dead);
    // hazards
    for (const l of this.lasers) if (laserOn(l, this.t) && !p.dead && overlap({ x: l.x - 3, y: l.y0, w: 6, h: l.y1 - l.y0 }, p)) p.hurt(this);
    for (const f of this.fallers) {
      if (f.st === 0) { if (Math.abs(p.x - f.x) < 56 && f.x > this.camX) { f.st = 1; f.t = 28; this.audio.sfx("warn"); } }
      else if (f.st === 1) { if (--f.t <= 0) f.st = 2; }
      else if (f.st === 2) {
        f.vy += 0.35; f.y += f.vy;
        if (!p.dead && overlap(f, p)) p.hurt(this);
        const gt = groundTop(lv, f.x + f.w / 2);
        if (gt !== null && f.y + f.h >= gt && f.y < gt) { f.y = gt - f.h; f.st = 3; f.t = 0; this.boom(f.x + f.w / 2, gt - 4, 1); this.shake = Math.max(this.shake, 3); this.audio.sfx("boom"); }
        if (f.y > H + 20) f.dead = true;
      } else if (++f.t > 40) f.dead = true;
    }
    this.fallers = this.fallers.filter((f) => !f.dead);
    if (this.boss) this.boss.update();
    for (const b of this.bgPuffs) { b.t++; b.y -= 0.3; b.x += 0.1; } this.bgPuffs = this.bgPuffs.filter((b) => b.t < 180);
    this.tickFx();
    this.shake = this.shake > 0.3 ? this.shake * 0.86 : 0; if (this.flashT > 0) this.flashT--;
  }

  // ---------- rendering ----------
  render() {
    const c = this.c; c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false; c.globalAlpha = 1;
    switch (this.state) {
      case "title": this.drawTitle(); break;
      case "options": this.drawOptions(); break;
      case "controls": this.drawControls(); break;
      case "intro": this.drawIntro(); break;
      case "card": this.drawCard(); break;
      case "ending": this.drawEnding(); break;
      default: this.drawScene(); this.drawHUD(); this.drawOverlay();
    }
  }
  drawScene() {
    const c = this.c, cx = this.camX, t = this.t;
    c.save();
    if (this.shake > 0.3) c.translate(Math.round(rnd(-this.shake, this.shake)), Math.round(rnd(-this.shake, this.shake)));
    drawBG(c, this);
    if (this.boss instanceof Hog && !(this.state === "ending")) this.boss.drawBg(c, cx);
    drawTiles(c, this);
    for (const l of this.lasers) if (l.x > cx - 20 && l.x < cx + W + 20) drawLaser(c, l, cx, t);
    for (const m of this.movers) drawMover(c, m, this.lv.world, cx, t);
    for (const f of this.fallers) drawFaller(c, f, this.lv.world, cx, t);
    for (const it of this.items) drawItem(c, it, cx);
    for (const cp of this.caps) drawCap(c, cp, cx);
    for (const e of this.enemies) if (!e.attached) drawEnemy(c, e, cx, t);
    if (this.boss && (!this.boss.dead || this.boss.deathT < this.boss.deathLen() - 20)) this.boss.draw(c, cx);
    drawPlayer(c, this.player, cx);
    for (const e of this.enemies) if (e.attached) drawEnemy(c, e, cx, t);
    for (const b of this.pb) drawPB(c, b, cx, t);
    for (const b of this.eb) drawEB(c, b, cx, t);
    for (const p of this.parts) { if (p.glyph) txt(c, p.glyph, p.x - cx, p.y, p.col, 5, "left", null); else R(c, p.x - cx, p.y, p.s, p.s, p.col); }
    for (const f of this.fx) drawFX(c, f, cx);
    for (const tx of this.texts) if (tx.s) txt(c, tx.s, tx.x - cx, tx.y, tx.col, 6);
    c.restore();
    if (this.flashT > 0) { c.globalAlpha = this.flashT / 16; R(c, 0, 0, W, H, "#ffffff"); c.globalAlpha = 1; }
  }
  drawHUD() {
    const c = this.c, p = this.player;
    c.globalAlpha = 0.75; R(c, 0, 0, W, 13, "#0a0614"); c.globalAlpha = 1; R(c, 0, 13, W, 1, "#3a3150");
    txt(c, "1P", 4, 3, "#ff4d6d", 6); txt(c, String(this.score).padStart(7, "0"), 18, 3, "#ffffff", 6);
    for (let i = 0; i < Math.min(Math.max(this.lives, 0), 6); i++) { const x = 66 + i * 9; R(c, x, 3, 7, 7, "#ffd21f"); R(c, x, 5, 7, 1, "#1a1426"); R(c, x + 4, 6, 2, 2, "#5fe3ff"); R(c, x + 1, 1, 1, 2, "#1a1426"); R(c, x + 5, 1, 1, 2, "#1a1426"); }
    txt(c, "HP", 124, 3, "#ff3b5b", 6);
    for (let i = 0; i < p.maxHp; i++) R(c, 138 + i * 6, 3, 4, 7, i < p.hp ? (p.hp <= 1 ? (this.t % 20 < 10 ? "#ff3b5b" : "#fff") : "#ff3b5b") : "#3a1a24");
    const w = p.wpn, wd = WEAP[w.id], wx = 186;
    R(c, wx, 2, 10, 10, wd.col); R(c, wx + 1, 3, 8, 8, "#1a1426"); txt(c, wd.letter, wx + 2, 3, wd.col, 6, "left", null);
    txt(c, wd.name, wx + 13, 3, wd.col, 6);
    for (let i = 0; i < 3; i++) R(c, wx + 13 + wd.name.length * 6 + 3 + i * 5, 4, 3, 5, i < w.lvl ? "#ffffff" : "#3a3150");
    let ox = wx + 13 + wd.name.length * 6 + 22;
    for (const o of p.weapons) if (o !== w) { R(c, ox, 4, 6, 6, WEAP[o.id].col); ox += 8; }
    txt(c, `W${this.world + 1}`, W - 4, 3, "#9aa3b5", 6, "right");
    const b = this.boss;
    if (b && !b.dead && b.intro <= 0) {
      txt(c, b.name, W / 2, 17, "#ffd21f", 6, "center");
      R(c, W / 2 - 81, 25, 162, 6, "#1a1426"); R(c, W / 2 - 80, 26, 160, 4, "#3a1a24");
      R(c, W / 2 - 80, 26, 160 * (b.hp / b.maxHp), 4, b.flash ? "#ffffff" : "#ff2a4a"); R(c, W / 2 - 80, 26, 160 * (b.hp / b.maxHp), 1, "#ff9aa8");
    }
    if (this.banner > 0 && this.state === "play") {
      this.banner--;
      if (Math.floor(this.banner / 10) % 2 === 0) { R(c, 0, 84, W, 2, "#ff2a2a"); R(c, 0, 118, W, 2, "#ff2a2a"); }
      c.globalAlpha = 0.6; R(c, 0, 86, W, 32, "#000"); c.globalAlpha = 1;
      txt(c, "!! WARNING !!", W / 2, 90, "#ff2a2a", 10, "center");
      txt(c, this.boss?.name || "", W / 2, 106, "#ffd21f", 8, "center");
    }
  }
  drawOverlay() {
    const c = this.c;
    if (this.state === "pause") {
      c.globalAlpha = 0.7; R(c, 0, 0, W, H, "#000"); c.globalAlpha = 1;
      txt(c, "PAUSED", W / 2, 60, "#ffd21f", 16, "center"); txt(c, "P / ESC  RESUME", W / 2, 96, "#fff", 8, "center");
      this.controlsList(120);
    }
    if (this.state === "clear") {
      c.globalAlpha = Math.min(0.75, this.st / 60); R(c, 0, 0, W, H, "#000"); c.globalAlpha = 1;
      if (this.st > 20) txt(c, "STAGE CLEAR!", W / 2, 66, this.t % 20 < 10 ? "#ffd21f" : "#ffffff", 16, "center");
      if (this.st > 60) txt(c, `SCORE ${String(this.score).padStart(7, "0")}`, W / 2, 100, "#fff", 8, "center");
      if (this.st > 90) txt(c, `BOSS BONUS 10000   CLEAR BONUS 5000`, W / 2, 118, "#7dff6a", 6, "center");
      if (this.st > 130) txt(c, `NEXT: ${buildName(this.world + 1)}`, W / 2, 146, "#5fe3ff", 8, "center");
    }
    if (this.state === "gameover") {
      c.globalAlpha = Math.min(0.85, this.st / 40); R(c, 0, 0, W, H, "#000"); c.globalAlpha = 1;
      txt(c, "GAME OVER", W / 2, 64, "#ff2a2a", 20, "center");
      txt(c, "THE HOARD GROWS STRONGER...", W / 2, 96, "#9aa3b5", 6, "center");
      ["CONTINUE", "TITLE"].forEach((s, i) => txt(c, (this.menu === i ? "> " : "  ") + s, W / 2 - 40, 124 + i * 16, this.menu === i ? "#ffd21f" : "#fff", 8));
    }
  }
  controlsList(y: number) {
    const rows = [["A D / ARROWS", "MOVE"], ["W / UP", "AIM UP"], ["S / DOWN", "CROUCH / AIM DOWN"], ["SPACE / Z", "JUMP (DOWN+JUMP DROPS)"], ["J / X", "SHOOT (HOLD)"], ["K / C", "SWITCH WEAPON"], ["P / ESC", "PAUSE"]];
    rows.forEach(([k, v], i) => { txt(this.c, k, 60, y + i * 12, "#ffd21f", 6); txt(this.c, v, 170, y + i * 12, "#fff", 6); });
  }
  dim(a = 0.55) { this.c.globalAlpha = a; R(this.c, 0, 0, W, H, "#05000a"); this.c.globalAlpha = 1; }
  bigTitle(y: number, size = 30) {
    const c = this.c;
    txt(c, "SNAPIE", W / 2 + 2, y + 2, "#1a1426", size, "center", "#1a1426");
    txt(c, "SNAPIE", W / 2, y, "#ffd21f", size, "center", null);
    c.save(); c.beginPath(); c.rect(0, y + size * 0.55, W, size); c.clip(); txt(c, "SNAPIE", W / 2, y, "#e08a00", size, "center", null); c.restore();
    c.save(); c.beginPath(); c.rect(0, y + size * 0.36, W, 2); c.clip(); txt(c, "SNAPIE", W / 2, y, "#1a1426", size, "center", null); c.restore();
    txt(c, "INFORMATION WAR", W / 2, y + size + 8, "#ff2a6d", 12, "center", "#1a1426");
  }
  drawTitle() {
    const c = this.c; drawBG(c, this); this.dim(0.6);
    this.bigTitle(22);
    drawSnapie(c, 70, 196, { face: 1, t: this.t, run: 0, air: -1, crouch: false, aimX: 0.707, aimY: -0.707, shoot: this.t % 30 < 4, flash: false, dead: false, deathT: 0, weapon: "sting", hurt: false, scale: 3 });
    if (!this.menus) { txt(c, "READY", 200, 130, this.t % 40 < 26 ? "#ffd21f" : "#5a5a7a", 12); return; }
    const opts = ["START GAME", this.saved > 0 ? `CONTINUE (W${this.saved + 1})` : "CONTINUE", "OPTIONS"];
    opts.forEach((s, i) => {
      const sel = this.menu === i, dis = i === 1 && this.saved === 0;
      txt(c, s, 170, 112 + i * 18, dis ? "#5a5a6a" : sel ? "#ffd21f" : "#ffffff", 8);
      if (sel && this.t % 30 < 22) { R(c, 156, 113 + i * 18, 7, 7, "#ffd21f"); R(c, 156, 115 + i * 18, 7, 1, "#1a1426"); R(c, 160, 116 + i * 18, 2, 2, "#5fe3ff"); }
    });
    txt(c, `HI ${String(this.hi).padStart(7, "0")}`, W / 2, 178, "#9aa3b5", 6, "center");
    txt(c, "© 2026 HIVE SOFT   PRESS ENTER", W / 2, 198, "#5a5a7a", 6, "center");
  }
  drawOptions() {
    const c = this.c; drawBG(c, this); this.dim(0.8);
    txt(c, "OPTIONS", W / 2, 30, "#ffd21f", 16, "center");
    const vals = [`MUSIC  ${this.settings.music ? "ON" : "OFF"}`, `SFX    ${this.settings.sfx ? "ON" : "OFF"}`, `LEVEL  ${["EASY", "NORMAL", "HARD"][this.settings.diff]}`, "CONTROLS", "BACK"];
    vals.forEach((s, i) => txt(c, (this.menu === i ? "> " : "  ") + s, 110, 70 + i * 20, this.menu === i ? "#ffd21f" : "#fff", 8));
    txt(c, "EASY 7HP 5 LIVES / NORMAL 5HP 4 / HARD 3HP 3", W / 2, 190, "#9aa3b5", 6, "center");
  }
  drawControls() { const c = this.c; R(c, 0, 0, W, H, "#05000a"); txt(c, "CONTROLS", W / 2, 30, "#ffd21f", 16, "center"); this.controlsList(70); txt(c, "AIM 8 WAYS: HOLD DIRECTIONS WHILE SHOOTING", W / 2, 166, "#5fe3ff", 6, "center"); txt(c, "PRESS ENTER", W / 2, 190, this.t % 40 < 20 ? "#fff" : "#5a5a7a", 8, "center"); }
  drawNetwork(mode: number, k: number) {
    const c = this.c, t = this.t, nodes = [[60, 70], [140, 50], [230, 60], [320, 80], [100, 140], [200, 130], [300, 150]];
    const hub = [192, 100], links = [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [1, 5], [2, 6], [3, 6]];
    for (const [a, b] of links) line(c, nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], 1, mode !== 1 && mode !== 2 ? "#2a6a8a" : "#2a2040");
    for (let i = 0; i < links.length; i++) {
      const [a, b] = links[i], q = ((t * 0.01 + i * 0.13) % 1);
      if (mode !== 1 && mode !== 2) R(c, nodes[a][0] + (nodes[b][0] - nodes[a][0]) * q - 1, nodes[a][1] + (nodes[b][1] - nodes[a][1]) * q - 1, 3, 3, "#5fe3ff");
    }
    nodes.forEach(([x, y], i) => {
      const happy = mode === 0 || mode === 4 || (mode === 3 && k > i * 30);
      const hop = mode === 4 ? Math.abs(Math.sin(t * 0.15 + i)) * 10 : 0;
      drawBot(c, x, y - hop, happy, t + i * 7, mode === 2 || (mode === 1 && k > 60));
      if (mode === 1) { const q = ((t * 0.02 + i * 0.2) % 1); R(c, x + (hub[0] + 120 - x) * q, y + (hub[1] - y) * q, 2, 2, "#ff2a6d"); }
      if (mode === 3 && k < i * 30 + 30) { const q = clamp((k - i * 30) / 30, 0, 1); R(c, hub[0] + (x - hub[0]) * q - 4, hub[1] + (y - hub[1]) * q, 9, 4, "#1f7a3a"); }
    });
    if (mode === 1) { R(c, 300, 70, 60, 70, "#120612"); R(c, 312, 86, 10, 4, "#ff2a2a"); R(c, 338, 86, 10, 4, "#ff2a2a"); R(c, 318, 110, 24, 3, "#ff2a2a"); }
  }
  drawIntro() {
    const c = this.c, s = this.st, slide = Math.floor(s / 180), k = s % 180; R(c, 0, 0, W, H, "#05000a");
    if (slide < 4) {
      if (slide === 3) {
        for (let i = 0; i < 12; i++) { const a = i * 0.52 + this.t * 0.01; line(c, W / 2, 110, W / 2 + Math.cos(a) * 200, 110 + Math.sin(a) * 200, 1, "#2a1a08"); }
        drawSnapie(c, W / 2, 150 - Math.min(k, 60) * 0.5, { face: 1, t: this.t, run: 0, air: -1, crouch: false, aimX: 0, aimY: -1, shoot: k > 90 && k % 12 < 3, flash: false, dead: false, deathT: 0, weapon: "sting", hurt: false, scale: 3 });
      } else this.drawNetwork(slide === 2 ? 2 : slide, k);
      const l1 = INTRO[slide * 2], l2 = INTRO[slide * 2 + 1], n = Math.floor(k * 0.7);
      txt(c, l1.slice(0, n), W / 2, 172, "#ffffff", 8, "center"); txt(c, l2.slice(0, Math.max(0, n - l1.length)), W / 2, 186, "#ffffff", 8, "center");
    } else {
      if (k % 8 < 4 && k < 20) R(c, 0, 0, W, H, "#ffffff");
      this.bigTitle(50); if (this.t % 40 < 26) txt(c, "START", W / 2, 140, "#ffffff", 8, "center");
    }
    txt(c, "ENTER: SKIP", W - 6, 4, "#3a3a5a", 6, "right");
  }
  drawCard() {
    const c = this.c; R(c, 0, 0, W, H, "#05000a");
    txt(c, `WORLD ${this.world + 1}`, W / 2, 40, "#9aa3b5", 8, "center");
    txt(c, this.lv.name, W / 2, 58, "#ffd21f", 12, "center");
    txt(c, this.lv.sub, W / 2, 80, "#ff2a6d", 6, "center");
    const y = 130; line(c, 32, y, W - 32, y, 2, "#3a3150");
    NODES.forEach((n, i) => {
      const x = 32 + i * ((W - 64) / 5), cur = i === this.world, past = i < this.world;
      disc(c, x, y, cur ? 6 : 4, past ? "#7dff6a" : cur ? "#ffd21f" : i === 5 ? "#ff2a2a" : "#5a5a7a");
      txt(c, n, x, y + 12, cur ? "#ffd21f" : "#5a5a7a", 5, "center", null);
    });
    const sx = 32 + this.world * ((W - 64) / 5);
    drawSnapie(c, sx, y - 8 - Math.abs(Math.sin(this.t * 0.1)) * 4, { face: 1, t: this.t, run: 0, air: -1, crouch: false, aimX: 1, aimY: 0, shoot: false, flash: false, dead: false, deathT: 0, weapon: this.player.wpn.id, hurt: false });
    txt(c, `LIVES x ${this.lives}`, W / 2, 170, "#fff", 8, "center");
    if (this.st > 30 && this.t % 40 < 26) txt(c, "GET THE INFORMATION BACK!", W / 2, 190, "#5fe3ff", 6, "center");
  }
  drawEnding() {
    const c = this.c, s = this.st;
    if (s < 240) {
      this.drawScene();
      if (s > 170) { c.globalAlpha = Math.min(1, (s - 170) / 70); R(c, 0, 0, W, H, "#ffffff"); c.globalAlpha = 1; }
      return;
    }
    R(c, 0, 0, W, H, "#05000a");
    if (s < 860) {
      if (s < 560) { this.drawNetwork(3, s - 240); txt(c, "INFORMATION HAS BEEN", W / 2, 172, "#7dff6a", 8, "center"); txt(c, "REDISTRIBUTED.", W / 2, 186, "#7dff6a", 8, "center"); }
      else {
        this.drawNetwork(4, 999);
        drawSnapie(c, W / 2 - 14, 112, { face: 1, t: this.t, run: 0, air: 0, crouch: false, aimX: 0, aimY: -1, shoot: this.t % 20 < 3, flash: false, dead: false, deathT: 0, weapon: this.player.wpn.id, hurt: false, scale: 2 });
        if (this.t % 6 === 0) this.parts.push({ x: rnd(0, W) + this.camX, y: -4, vx: rnd(-0.5, 0.5), vy: rnd(0.5, 1.5), life: 200, col: ["#ffd21f", "#ff2a6d", "#5fe3ff", "#7dff6a"][this.t % 4], s: 2, g: 0 });
        for (const p of this.parts) R(c, p.x - this.camX, p.y, p.s, p.s, p.col);
        txt(c, "THE INTERNET IS FOR EVERYONE.", W / 2, 180, "#ffd21f", 8, "center");
      }
      return;
    }
    txt(c, "SNAPIE WILL RETURN...", W / 2, 80, "#ffd21f", 12, "center");
    if (s > 960) txt(c, `FINAL SCORE ${String(this.score).padStart(7, "0")}`, W / 2, 116, "#fff", 8, "center");
    if (s > 1060) txt(c, "THANK YOU FOR PLAYING", W / 2, 140, "#ff2a6d", 6, "center");
    if (s > 1150 && this.t % 40 < 26) txt(c, "PRESS ENTER", W / 2, 180, "#9aa3b5", 8, "center");
  }
}
function buildName(w: number) { return ["THE COUNTRYSIDE", "THE INDUSTRIAL ZONE", "THE CITY", "THE SERVER FACILITY", "THE CENTRAL DATA CENTER"][w] || ""; }
export function drawBot(c: Ctx, x: number, y: number, happy: boolean, t: number, sad: boolean) {
  R(c, x - 7, y - 6, 14, 12, happy ? "#7a8296" : "#4a4e5e"); R(c, x - 7, y - 6, 14, 1, "#b8c0d0");
  line(c, x, y - 6, x, y - 11, 1, "#9aa3b5"); R(c, x - 1, y - 13, 3, 3, happy ? (t % 30 < 15 ? "#7dff6a" : "#ffd21f") : "#3a3a3a");
  if (happy) { R(c, x - 4, y - 3, 2, 2, "#5fe3ff"); R(c, x + 2, y - 3, 2, 2, "#5fe3ff"); R(c, x - 3, y + 2, 6, 1, "#1a1426"); R(c, x - 4, y + 1, 1, 1, "#1a1426"); R(c, x + 3, y + 1, 1, 1, "#1a1426"); }
  else { R(c, x - 4, y - 2, 2, 1, "#1a1426"); R(c, x + 2, y - 2, 2, 1, "#1a1426"); R(c, x - 3, y + 2, 6, 1, "#1a1426"); }
  R(c, x - 5, y + 6, 10, 6, happy ? "#5a6275" : "#3a3e4e");
  if (sad) { R(c, x + 9, y - 2, 8, 5, "#1a1426"); R(c, x + 10, y - 1, t % 30 < 15 ? 1 : 0, 3, "#ff2a2a"); R(c, x + 17, y, 1, 2, "#1a1426"); txt(c, "0%", x + 6, y + 5, t % 30 < 15 ? "#ff2a2a" : "#601010", 5, "left", null); }
}
