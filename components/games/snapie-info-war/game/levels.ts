// @ts-nocheck — data-driven stage builder. Add a world by adding a script to SCRIPTS.
import { ROWS, T } from "./core";

export type EType = "drone" | "term" | "dog" | "orb" | "para" | "turret" | "ram";
export interface Spawn { x: number; y: number; type: EType; done: boolean }
export interface MoverDef { x: number; y: number; w: number; ax: number; ay: number; range: number; speed: number }
export interface LevelData {
  world: number; name: string; sub: string; cols: number; tiles: Uint8Array; hazard: "fire" | "electric";
  spawns: Spawn[]; checkpoints: number[]; movers: MoverDef[]; lasers: { x: number; y0: number; y1: number; off: number }[];
  fallers: { x: number }[]; caps: { x: number; y: number; item: string }[]; items: { x: number; y: number; item: string }[];
  arenaX: number; boss: string;
}
// Tiles: 0 empty, 1 solid, 2 one-way, 3 hazard, 4 conveyor right, 5 conveyor left
class B {
  d: LevelData; c = 0; s = 0; h = 3;
  constructor(world: number, name: string, sub: string, hazard: "fire" | "electric") {
    this.d = { world, name, sub, cols: 400, tiles: new Uint8Array(400 * ROWS), hazard, spawns: [], checkpoints: [40], movers: [], lasers: [], fallers: [], caps: [], items: [], arenaX: 0, boss: "" };
  }
  set(c: number, r: number, v: number) { if (c >= 0 && c < this.d.cols && r >= 0 && r < ROWS) this.d.tiles[r * this.d.cols + c] = v; }
  col(c: number, h: number, top = 1) { for (let r = ROWS - h; r < ROWS; r++) this.set(c, r, r === ROWS - h ? top : 1); }
  g(n: number, h = this.h) { this.s = this.c; for (let i = 0; i < n; i++) this.col(this.c + i, h); this.c += n; this.h = h; return this; }
  pit(n: number) { this.s = this.c; this.c += n; return this; }
  hz(n: number) { this.s = this.c; for (let i = 0; i < n; i++) this.col(this.c + i, this.h, 3); this.c += n; return this; }
  conv(n: number, dir: number) { this.s = this.c; for (let i = 0; i < n; i++) this.col(this.c + i, this.h, dir > 0 ? 4 : 5); this.c += n; return this; }
  plat(dx: number, hr: number, len: number) { for (let i = 0; i < len; i++) this.set(this.s + dx + i, ROWS - hr, 2); return this; }
  blk(dx: number, hr: number, len: number, th = 1) { for (let i = 0; i < len; i++) for (let k = 0; k < th; k++) this.set(this.s + dx + i, ROWS - hr + k, 1); return this; }
  mover(n: number, hr: number, ax: number, ay: number, range: number, speed = 0.02) {
    this.s = this.c;
    this.d.movers.push({ x: (this.c + n / 2) * T - 20, y: (ROWS - hr) * T, w: 40, ax, ay, range, speed });
    this.c += n; return this;
  }
  e(type: EType, dx = 0, hr = -1) { this.d.spawns.push({ x: (this.s + dx) * T, y: hr < 0 ? -1 : (ROWS - hr) * T, type, done: false }); return this; }
  cp() { this.d.checkpoints.push(this.c * T + 8); return this; }
  cap(dx: number, item: string, hr = 9) { this.d.caps.push({ x: (this.s + dx) * T, y: (ROWS - hr) * T, item }); return this; }
  item(dx: number, hr: number, item: string) { this.d.items.push({ x: (this.s + dx) * T, y: (ROWS - hr) * T - 12, item }); return this; }
  laser(dx: number, off = 0) { this.d.lasers.push({ x: (this.s + dx) * T + 8, y0: 0, y1: (ROWS - this.h) * T, off }); return this; }
  fall(dx: number) { this.d.fallers.push({ x: (this.s + dx) * T }); return this; }
  arena(boss: string, plats = false) {
    if (this.h !== 3) this.g(2, 3);
    this.d.arenaX = this.c * T; this.d.boss = boss; this.cp();
    this.g(24, 3);
    if (plats) { this.plat(3, 6, 4); this.plat(17, 6, 4); }
    for (let r = 0; r < ROWS; r++) this.set(this.c, r, 1);
    this.d.cols = this.c + 1;
    const t = new Uint8Array(this.d.cols * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < this.d.cols; c++) t[r * this.d.cols + c] = this.d.tiles[r * 400 + c];
    this.d.tiles = t; return this.d;
  }
}

const SCRIPTS: (() => LevelData)[] = [
  () => new B(1, "THE COUNTRYSIDE", "THE FARMS HAVE GONE QUIET", "electric")
    .g(16).e("term", 14).g(8).e("term", 4).e("term", 7).cap(2, "S", 9)
    .pit(3).g(8).e("dog", 6).e("drone", 7, 10)
    .g(6, 4).plat(1, 7, 3).e("term", 4)
    .g(8, 5).e("drone", 5, 11).e("drone", 7, 10).e("term", 6)
    .cp().g(6, 3).pit(2).g(5).e("dog", 4).pit(3)
    .g(12).plat(2, 6, 3).plat(6, 9, 4).item(8, 9, "H").e("term", 6).e("dog", 10).e("drone", 11, 10)
    .g(8, 4).e("term", 4).cap(3, "L", 10).e("term", 7)
    .cp().g(12, 3).e("para", 6).e("term", 10).e("drone", 9, 11)
    .pit(2).g(5, 5).pit(2).g(5, 4).e("drone", 2, 11).e("dog", 4)
    .g(12, 3).hz(2).g(6).e("para", 3).e("dog", 5).e("term", 8)
    .arena("harvester"),
  () => new B(2, "THE INDUSTRIAL ZONE", "WHERE ROBOTS ARE ASSEMBLED", "fire")
    .g(10).e("term", 8).conv(10, 1).e("dog", 8).e("term", 9)
    .hz(3).g(6).plat(0, 6, 4).e("orb", 5, 8).fall(3)
    .mover(6, 4, 1, 0, 40).g(6).e("turret", 4, 4).e("term", 5)
    .g(10, 4).cap(3, "B", 9).conv(8, -1).e("dog", 6).e("drone", 6, 10)
    .cp().g(4, 3).hz(4).plat(0, 6, 4).g(6).fall(2).fall(4).e("orb", 5, 9).e("term", 5)
    .mover(6, 4, 0, 1, 24, 0.03).g(8, 4).e("turret", 3, 7).blk(3, 6, 2, 2).e("para", 6)
    .g(6, 3).hz(3).g(4).e("term", 3).cap(1, "S", 10)
    .cp().conv(12, 1).fall(4).fall(8).e("dog", 8).e("orb", 10, 9).e("term", 11)
    .mover(6, 5, 1, 0, 34).g(10, 5).e("turret", 6, 5).e("para", 7).e("drone", 8, 11)
    .g(6, 3).hz(2).g(8).item(4, 6, "H").plat(3, 6, 3).e("term", 6).e("dog", 7)
    .arena("overseer", true),
  () => new B(3, "THE CITY", "NEON LIES AND STOLEN BANDWIDTH", "electric")
    .g(14, 4).e("term", 12).e("drone", 13, 11).pit(2).g(10, 5).e("drone", 6, 12).e("drone", 8, 10).fall(5)
    .pit(2).g(4, 7).e("turret", 1, 7).g(8, 5).e("term", 5).e("dog", 7)
    .mover(8, 5, 1, 0, 50, 0.018).g(8, 4).cap(3, "L", 10).e("drone", 5, 11).e("term", 7)
    .cp().pit(2).g(6, 6).e("turret", 3, 6).fall(3).pit(2).g(10, 4).plat(2, 7, 3).plat(6, 10, 3).item(7, 10, "H").e("dog", 6).e("drone", 8, 12)
    .mover(8, 4, 1, 0, 48, 0.022).g(6, 4).e("para", 4).e("drone", 5, 10).g(4, 7).e("turret", 2, 7).g(8, 4).e("term", 5).fall(4)
    .cp().g(10, 3).e("dog", 6).e("dog", 9).cap(4, "B", 10).pit(3).g(8, 5).e("drone", 4, 11).e("drone", 6, 12).e("orb", 7, 9)
    .mover(8, 5, 1, 0, 48, 0.02).g(10, 4).e("term", 6).e("para", 8).e("turret", 9, 4)
    .arena("enforcer"),
  () => new B(4, "THE SERVER FACILITY", "THE STOLEN INTERNET HUMS HERE", "electric")
    .g(12).e("term", 10).laser(8).g(8).laser(4, 60).e("orb", 6, 8)
    .hz(4).plat(0, 6, 4).g(6).e("turret", 4, 3).e("para", 5)
    .conv(8, -1).laser(4).g(6, 4).e("orb", 4, 9).cap(2, "S", 10)
    .cp().mover(6, 4, 0, 1, 34, 0.03).g(8, 4).e("turret", 6, 4).laser(3, 90).e("term", 5)
    .hz(3).plat(0, 7, 3).g(6).e("para", 4).e("drone", 5, 11).laser(5)
    .conv(10, 1).e("dog", 8).e("orb", 9, 8).g(4).item(2, 6, "H").plat(1, 6, 3)
    .cp().g(8, 3).laser(3).laser(6, 90).e("term", 6).hz(4).plat(0, 6, 4).g(6).e("orb", 4, 9).e("turret", 5, 3)
    .mover(7, 4, 1, 0, 40).g(10, 4).cap(4, "L", 10).e("para", 6).e("dog", 8).e("drone", 9, 11)
    .g(4, 3).laser(2).g(8).e("orb", 5, 9).e("term", 7)
    .arena("warden"),
  () => new B(5, "THE CENTRAL DATA CENTER", "THE HEART OF THE HOARD", "electric")
    .g(12).e("term", 10).e("drone", 11, 11).laser(8).g(8).fall(4).e("orb", 6, 8).e("dog", 7)
    .hz(4).plat(0, 6, 4).mover(8, 4, 1, 0, 50, 0.022).g(8, 4).e("turret", 6, 4).e("para", 4).cap(2, "S", 10)
    .cp().conv(10, 1).laser(3).laser(7, 90).e("term", 8).e("dog", 9).g(8).fall(3).fall(6).e("orb", 6, 9).e("drone", 7, 11)
    .hz(3).plat(0, 7, 3).g(4, 5).e("turret", 2, 5).mover(7, 5, 0, 1, 34, 0.03).g(10, 4).e("para", 5).e("term", 8).item(6, 8, "H").plat(5, 8, 3)
    .cp().g(6, 3).laser(3).conv(8, -1).e("dog", 6).e("orb", 7, 9).fall(4).g(6).cap(2, "B", 10).e("term", 5).e("drone", 5, 11)
    .mover(8, 4, 1, 0, 50, 0.025).g(8, 4).laser(4, 60).e("turret", 6, 4).e("orb", 7, 10).e("para", 3)
    .g(6, 3).hz(2).g(8).e("term", 4).e("dog", 6).cap(4, "L", 10)
    .arena("hog"),
];
export const WORLD_COUNT = SCRIPTS.length;
export const buildLevel = (w: number) => SCRIPTS[w]();
export const WORLD_NAMES = ["COUNTRYSIDE", "INDUSTRIAL", "CITY", "SERVERS", "DATA CENTER"];
