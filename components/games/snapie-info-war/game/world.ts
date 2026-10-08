// @ts-nocheck — per-world parallax backgrounds, tiles, and environment props.
import { R, line, disc, ring, txt, hash, H, W, T, ROWS, type Ctx } from "./core";
import type { Game } from "./game";
import { tileAt } from "./entities";
import { drawRam } from "./bosses";

const grads: Record<string, CanvasGradient> = {};
function sky(c: Ctx, key: string, a: string, b: string) {
  if (!grads[key]) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); grads[key] = g; }
  c.fillStyle = grads[key]; c.fillRect(0, 0, W, H);
}
function ridge(c: Ctx, cam: number, f: number, base: number, amp: number, fr: number, col: string, seed = 0) {
  for (let x = 0; x < W; x += 2) { const wx = x + cam * f; const h = amp * (Math.sin(wx * fr + seed) * 0.6 + Math.sin(wx * fr * 2.7 + seed * 2) * 0.4); R(c, x, base - h, 2, H - base + h, col); }
}
// Repeating prop placement: calls fn for every slot visible at parallax f
function props(cam: number, f: number, spacing: number, fn: (sx: number, i: number) => void) {
  const off = cam * f, i0 = Math.floor(off / spacing) - 1;
  for (let i = i0; i < i0 + Math.ceil(W / spacing) + 3; i++) fn(i * spacing - off, i);
}

export function drawBG(c: Ctx, g: Game) {
  const cam = g.camX, t = g.t, w = g.lv.world;
  if (w === 1) {
    sky(c, "w1", "#4ab8ff", "#c8f2ff");
    disc(c, 320, 36, 14, "#fff6c0"); disc(c, 320, 36, 11, "#ffffff");
    props(cam, 0.08, 140, (x, i) => { const y = 20 + hash(i) * 40; for (let k = 0; k < 4; k++) disc(c, x + k * 10, y + (k % 2) * 3, 8, "#ffffff"); });
    ridge(c, cam, 0.15, 120, 16, 0.012, "#8ab8d8", 1);
    ridge(c, cam, 0.3, 140, 12, 0.02, "#5aa860", 3);
    props(cam, 0.3, 260, (x, i) => { // windmill + broken antenna
      if (hash(i + 4) < 0.5) { R(c, x, 96, 4, 44, "#c8c0b0"); const a = t * 0.03 + i; for (let b = 0; b < 4; b++) line(c, x + 2, 96, x + 2 + Math.cos(a + b * 1.57) * 16, 96 + Math.sin(a + b * 1.57) * 16, 2, "#e8e0d0"); }
      else { line(c, x, 140, x + 6, 90, 2, "#6a6a70"); line(c, x + 12, 140, x + 6, 90, 2, "#6a6a70"); line(c, x + 6, 90, x + 14, 84, 2, "#6a6a70"); if (t % 40 < 4) R(c, x + 12, 82, 3, 3, "#5fe3ff"); }
    });
    ridge(c, cam, 0.5, 158, 8, 0.03, "#3f8a44", 5);
    props(cam, 0.6, 70, (x, i) => { if (hash(i * 3) < 0.6) { R(c, x + 6, 140, 4, 22, "#5a3a20"); disc(c, x + 8, 134, 11, "#2f7a34"); disc(c, x + 5, 130, 6, "#4aa04a"); } else if (hash(i * 5) < 0.5) { R(c, x, 146, 24, 14, "#6a4a3a"); R(c, x + 3, 140, 18, 6, "#9a3a2a"); R(c, x + 9, 150, 6, 10, "#2a1a10"); } });
    props(cam, 0.75, 330, (x) => { R(c, x, 120, 30, 40, "#5a6275"); R(c, x + 4, 124, 22, 8, "#1a1426"); R(c, x + 8, 126, 4, 3, t % 30 < 15 ? "#ff2a2a" : "#601010"); line(c, x + 15, 120, x + 15, 104, 2, "#9aa3b5"); const a = t * 0.2; line(c, x + 15, 104, x + 15 + Math.cos(a) * 8, 104 + Math.sin(a) * 4, 2, "#c8ccd8"); });
  } else if (w === 2) {
    sky(c, "w2", "#2a1210", "#c4542a");
    disc(c, 80, 60, 20, "#e8802a");
    props(cam, 0.12, 90, (x, i) => { const h = 50 + hash(i) * 50; R(c, x, 150 - h, 50, h + 70, "#3a1c18"); const sx = x + 10 + hash(i + 1) * 30; R(c, sx, 150 - h - 30, 6, 30, "#3a1c18"); if (t % 8 === 0) g.bgPuffs.push({ x: sx + 3 + cam * 0.12, y: 150 - h - 32, t: 0, f: 0.12 }); });
    for (const p of g.bgPuffs) disc(c, p.x - cam * p.f, p.y, 3 + p.t * 0.08, `rgba(90,70,70,${Math.max(0, 0.6 - p.t / 180)})`);
    props(cam, 0.35, 120, (x, i) => { R(c, x, 100, 120, 10, "#5a3a30"); R(c, x, 100, 120, 2, "#8a5a40"); R(c, x + 50, 96, 10, 18, "#4a2a24"); if (hash(i) < 0.5) { R(c, x + 90, 60, 8, 40, "#5a3a30"); } });
    props(cam, 0.5, 150, (x, i) => { const a = t * 0.03 * (i % 2 ? 1 : -1); disc(c, x + 40, 120, 18, "#4a2e28"); for (let k = 0; k < 8; k++) { const an = a + k * 0.785; R(c, x + 40 + Math.cos(an) * 19 - 3, 120 + Math.sin(an) * 19 - 3, 6, 6, "#4a2e28"); } disc(c, x + 40, 120, 6, "#2a1814"); const py = 130 + Math.abs(Math.sin(t * 0.05 + i)) * 20; R(c, x + 100, 100, 14, py - 100, "#5a4a44"); R(c, x + 96, py, 22, 6, "#ffd21f"); if (hash(i + t / 40 | 0) > 0.93) g.sparks(x + 107 + cam, py + 6, "#ffb000", 1); });
  } else if (w === 3) {
    sky(c, "w3", "#0a0520", "#3b1d5e");
    for (let i = 0; i < 40; i++) R(c, hash(i) * W, hash(i + 9) * 90, 1, 1, t % (30 + i) < 3 ? "#5a5a8a" : "#c8c8ff");
    props(cam, 0.1, 40, (x, i) => { const h = 60 + hash(i) * 70; R(c, x, 180 - h, 36, h, "#1a1038"); for (let wy = 0; wy < h - 8; wy += 8) for (let wx = 3; wx < 33; wx += 6) if (hash(i * 31 + wy * 7 + wx) > 0.6) R(c, x + wx, 184 - h + wy, 2, 3, "#ffc84a"); });
    // flying traffic
    for (let l = 0; l < 3; l++) for (let k = 0; k < 4; k++) { const sp = (l % 2 ? -1 : 1) * (0.6 + l * 0.3); const xx = (((k * 120 + t * sp) % 480) + 480) % 480 - 48; const yy = 50 + l * 16; R(c, xx, yy, 12, 4, ["#ff2a6d", "#5fe3ff", "#ffd21f"][l]); R(c, xx + (sp > 0 ? 12 : -2), yy + 1, 2, 2, "#fff"); }
    props(cam, 0.35, 200, (x, i) => { // giant screen + neon
      R(c, x, 70, 70, 50, "#0d0820"); R(c, x + 3, 73, 64, 44, "#102a4a");
      const ph = Math.floor(t / 90 + i) % 3;
      if (ph === 0) { R(c, x + 20, 84, 8, 8, "#ff2a6d"); R(c, x + 42, 84, 8, 8, "#ff2a6d"); R(c, x + 22, 102, 26, 4, "#ff2a6d"); }
      else txt(c, ph === 1 ? "OBEY" : "NO RAM", x + 35, 90, "#5fe3ff", 8, "center", null);
      for (let s = 0; s < 22; s++) R(c, x + 3, 73 + s * 2, 64, 1, "rgba(0,0,0,0.3)");
      R(c, x + 30, 120, 10, 60, "#0d0820");
      const on = hash(i + Math.floor(t / 10)) > 0.1; txt(c, ["RAM 4 SALE", "DATA $$$", "BUY BYTES"][i % 3 < 0 ? 0 : Math.abs(i) % 3], x + 110, 60, on ? "#ff4dd8" : "#4a1a4a", 6, "center", null);
      line(c, x + 160, 180, x + 160, 30, 2, "#3a2a5a"); line(c, x + 152, 60, x + 168, 60, 1, "#3a2a5a"); R(c, x + 159, 28, 3, 3, t % 40 < 20 ? "#ff2020" : "#400");
    });
    props(cam, 0.55, 64, (x, i) => { const h = 30 + hash(i * 7) * 40; R(c, x, 200 - h, 48, h, "#24164a"); for (let wy = 0; wy < h; wy += 10) for (let wx = 4; wx < 44; wx += 10) R(c, x + wx, 204 - h + wy, 4, 5, hash(i + wy + wx) > 0.5 ? "#5fe3ff" : "#140c2c"); });
  } else if (w === 4) {
    sky(c, "w4", "#02050d", "#0a1a30");
    props(cam, 0.15, 30, (x, i) => { R(c, x, 20, 26, 160, "#0b1424"); for (let r = 0; r < 18; r++) R(c, x + 3, 24 + r * 8, 20, 6, "#101c32"), R(c, x + 5 + (hash(i * 9 + r) * 14 | 0), 26 + r * 8, 2, 2, hash(i * 13 + r + Math.floor(t / 6)) > 0.5 ? "#00ff9a" : "#ff8a00"); });
    // data streams
    props(cam, 0.3, 24, (x, i) => { if (hash(i * 3) < 0.4) for (let k = 0; k < 6; k++) { const yy = ((t * (1 + hash(i)) + k * 30 + hash(i) * 200) % 240) - 20; c.globalAlpha = 1 - k * 0.12; txt(c, hash(i + k) > 0.5 ? "1" : "0", x, yy, "#00ffc8", 6, "left", null); } c.globalAlpha = 1; });
    props(cam, 0.4, 220, (x, i) => { const fx = x + 60, fy = 70; disc(c, fx, fy, 30, "#0b1424"); ring(c, fx, fy, 30, "#2a4a6a", 40, 2); for (let b = 0; b < 6; b++) { const a = t * 0.15 + b * 1.047; line(c, fx, fy, fx + Math.cos(a) * 26, fy + Math.sin(a) * 26, 4, "#1c3048"); } disc(c, fx, fy, 6, "#5fe3ff"); });
    props(cam, 0.6, 90, (x, i) => { for (let k = 0; k < 3; k++) { const col = ["#ff2a6d", "#5fe3ff", "#ffd21f"][k]; for (let s = 0; s < 40; s++) { const yy = s * 4, xx = x + k * 4 + Math.sin(s * 0.2 + i) * 6; R(c, xx, yy, 2, 4, col); } } });
  } else {
    sky(c, "w5", "#05000a", "#2a0518");
    props(cam, 0.08, 110, (x, i) => { R(c, x, 0, 50, H, "#120612"); R(c, x + 23, 0, 4, H, (t + i * 20) % 60 < 30 ? "#ff2a6d" : "#5a0a2a"); });
    props(cam, 0.2, 80, (x, i) => { const yy = 40 + hash(i) * 60; c.globalAlpha = 0.6; for (let k = 0; k < 3; k++) drawRam(c, x + k * 3, yy + k * 10, t + k); c.globalAlpha = 1; });
    for (let l = 0; l < 10; l++) { const yy = 20 + l * 15, sp = 1.5 + (l % 3); for (let k = 0; k < 5; k++) { const xx = ((k * 90 + t * sp + l * 37) % 450) - 40; R(c, xx, yy, 10, 1, l % 2 ? "#ff2a6d" : "#5fe3ff"); } }
    props(cam, 0.4, 170, (x, i) => { const pr = 16 + Math.sin(t * 0.05 + i) * 3; disc(c, x + 40, 100, pr + 6, "#3a0a24"); disc(c, x + 40, 100, pr, "#7a1a4a"); disc(c, x + 40, 100, pr * 0.5, "#ff2a6d"); R(c, x + 32, 100 + pr + 6, 16, 80, "#1a0a14"); });
    props(cam, 0.6, 120, (x, i) => { line(c, x, 0, x + 30, 90 + hash(i) * 30, 6, "#1d0a1a"); line(c, x + 30, 90 + hash(i) * 30, x + 60, 0, 6, "#1d0a1a"); });
  }
}

export function drawTiles(c: Ctx, g: Game) {
  const lv = g.lv, cam = g.camX, t = g.t, w = lv.world;
  const c0 = Math.floor(cam / T), c1 = c0 + Math.ceil(W / T) + 1;
  for (let col = c0; col <= c1; col++) if (!tileAt(lv, col, ROWS - 1)) { const x = col * T - cam; c.globalAlpha = 0.85; R(c, x, 168, T, 8, "#05000a"); c.globalAlpha = 1; R(c, x, 176, T, H - 176, "#05000a"); }
  for (let col = c0; col <= c1; col++) for (let r = 0; r < ROWS; r++) {
    const tl = tileAt(lv, col, r); if (!tl || col < 0 || col >= lv.cols) continue;
    const x = col * T - cam, y = r * T, top = !tileAt(lv, col, r - 1) || tileAt(lv, col, r - 1) === 2, hv = hash(col * 13 + r * 7);
    if (tl === 2) { drawOneWay(c, x, y, w, col); continue; }
    // base fill
    const base = ["", "#7a4a26", "#4e5462", "#2e2648", "#1c2840", "#1a0c1a"][w];
    R(c, x, y, T, T, base);
    if (w === 1) { if (hv > 0.5) R(c, x + (hv * 12 | 0), y + 6 + (hv * 8 | 0), 2, 2, "#5a3416"); if (hv < 0.2) R(c, x + 4, y + 10, 3, 2, "#9a6a40"); }
    if (w === 2) { R(c, x, y, T, 1, "#6a7080"); R(c, x, y, 1, T, "#6a7080"); R(c, x + 2, y + 2, 1, 1, "#9aa3b5"); R(c, x + 13, y + 2, 1, 1, "#9aa3b5"); R(c, x + 2, y + 13, 1, 1, "#9aa3b5"); R(c, x + 13, y + 13, 1, 1, "#9aa3b5"); }
    if (w === 3) { for (let k = 0; k < 2; k++) R(c, x + 3 + k * 7, y + 5, 4, 6, hash(col * 3 + r + k) > 0.55 ? "#ffd27a" : "#1a1430"); }
    if (w === 4) { R(c, x, y, T, 1, "#2a3a5a"); if (hv > 0.5) { R(c, x + 2, y + 8, 12, 1, "#0f4a6a"); R(c, x + 12, y + 4, 1, 5, "#0f4a6a"); } }
    if (w === 5) { if (hv > 0.4) { const on = (t + col * 5) % 80 < 40; R(c, x + 1, y + 6, 14, 1, on ? "#7a1a4a" : "#3a0a24"); R(c, x + 4, y + 2, 1, 5, on ? "#7a1a4a" : "#3a0a24"); } }
    if (!top) continue;
    if (tl === 3) { drawHazard(c, x, y, lv.hazard, t, col); continue; }
    if (tl === 4 || tl === 5) { R(c, x, y, T, 6, "#202028"); const d = tl === 4 ? 1 : -1; for (let k = 0; k < 4; k++) { const ox = (((k * 4 + t * 0.9 * d) % 16) + 16) % 16; R(c, x + ox, y + 2, 2, 2, "#ffd21f"); } R(c, x, y + 5, T, 1, "#5a5a60"); disc(c, x + 8, y + 3, 1, "#888"); continue; }
    if (w === 1) { R(c, x, y, T, 4, "#4ab04a"); R(c, x, y + 4, T, 1, "#2f7a34"); for (let k = 0; k < 4; k++) R(c, x + k * 4 + (hv * 3 | 0), y - 2, 1, 2, "#4ab04a"); }
    if (w === 2) { for (let k = 0; k < 4; k++) R(c, x + k * 4, y, 2, 3, k % 2 ? "#1a1426" : "#ffd21f"), R(c, x + k * 4 + 2, y, 2, 3, k % 2 ? "#ffd21f" : "#1a1426"); }
    if (w === 3) { R(c, x, y, T, 3, "#6a5a8a"); R(c, x, y + 3, T, 1, "#1a1430"); }
    if (w === 4) { R(c, x, y, T, 2, "#5fe3ff"); R(c, x, y + 2, T, 1, "#2a6a8a"); }
    if (w === 5) { R(c, x, y, T, 2, (t + col * 3) % 60 < 30 ? "#ff2a6d" : "#c01a5a"); }
  }
}
function drawOneWay(c: Ctx, x: number, y: number, w: number, col: number) {
  if (w === 1) { R(c, x, y, T, 4, "#a8743a"); R(c, x, y + 4, T, 1, "#5a3416"); R(c, x + 7, y + 4, 2, 6, "#7a4a26"); }
  else if (w === 2) { R(c, x, y, T, 3, "#7a8296"); for (let k = 0; k < 4; k++) R(c, x + k * 4 + 1, y + 3, 2, 3, "#3a3a44"); }
  else if (w === 3) { R(c, x, y, T, 4, "#c03a2a"); line(c, x, y + 4, x + 8, y + 8, 1, "#802a20"); line(c, x + 8, y + 8, x + 16, y + 4, 1, "#802a20"); }
  else if (w === 4) { R(c, x, y, T, 3, "#3a5a7a"); R(c, x + 2, y + 3, T - 4, 2, "#ff8a00"); }
  else { R(c, x, y, T, 3, "#5a1a3a"); R(c, x, y, T, 1, "#ff2a6d"); }
}
function drawHazard(c: Ctx, x: number, y: number, kind: string, t: number, col: number) {
  if (kind === "fire") {
    R(c, x, y, T, 4, "#3a1a10"); R(c, x + 2, y + 1, 12, 2, "#ff6a00");
    for (let k = 0; k < 3; k++) { const h = 6 + Math.abs(Math.sin(t * 0.3 + col + k * 2)) * 8; R(c, x + 1 + k * 5, y - h, 4, h, "#ff6a00"); R(c, x + 2 + k * 5, y - h + 3, 2, h - 3, "#ffd27a"); }
  } else {
    R(c, x, y, T, 4, "#20304a"); R(c, x, y, T, 1, "#5fe3ff");
    if ((t + col * 3) % 10 < 6) { const a = hash(col + Math.floor(t / 3)) * 6; line(c, x + 2, y, x + 6 + a, y - 6, 1, "#c0f8ff"); line(c, x + 6 + a, y - 6, x + 12, y - 1, 1, "#5fe3ff"); }
  }
}

export function drawMover(c: Ctx, m: { x: number; y: number; w: number }, w: number, cam: number, t: number) {
  const x = Math.round(m.x - cam), y = Math.round(m.y);
  if (w === 3) { // hover car
    R(c, x, y, m.w, 6, "#ff2a6d"); R(c, x + 6, y - 5, m.w - 14, 5, "#5fe3ff"); R(c, x, y, m.w, 1, "#ffb0d0"); R(c, x + 2, y + 6, m.w - 4, 2, "#5a1a3a");
    R(c, x + 4, y + 8, 6, 2 + (t % 4 < 2 ? 2 : 0), "#ffd21f"); R(c, x + m.w - 10, y + 8, 6, 2 + (t % 4 < 2 ? 0 : 2), "#ffd21f");
  } else if (w === 1) { R(c, x, y, m.w, 5, "#a8743a"); R(c, x, y + 5, m.w, 2, "#5a3416"); line(c, x + 4, y, x + 4, y - 40, 1, "#5a3416"); line(c, x + m.w - 4, y, x + m.w - 4, y - 40, 1, "#5a3416"); }
  else { R(c, x, y, m.w, 6, w >= 4 ? "#1c3048" : "#5a6275"); for (let k = 0; k < m.w; k += 8) R(c, x + k, y, 4, 2, w >= 4 ? "#5fe3ff" : "#ffd21f"); R(c, x + m.w / 2 - 4, y + 6, 8, 3 + (t % 4 < 2 ? 2 : 0), w >= 4 ? "#5fe3ff" : "#ff8a00"); }
}
export function drawLaser(c: Ctx, l: { x: number; y0: number; y1: number; off: number }, cam: number, t: number) {
  const x = Math.round(l.x - cam), ph = (t + l.off) % 180;
  R(c, x - 5, l.y0, 10, 8, "#40465a"); R(c, x - 3, l.y0 + 6, 6, 3, ph >= 60 ? "#ff2a2a" : "#401010");
  R(c, x - 5, l.y1 - 4, 10, 4, "#40465a");
  if (ph >= 60 && ph < 100 && ph % 6 < 3) R(c, x, l.y0 + 8, 1, l.y1 - l.y0 - 12, "#ff2a2a");
  if (ph >= 100) { R(c, x - 3, l.y0 + 8, 6, l.y1 - l.y0 - 12, "#ff2a2a"); R(c, x - 1, l.y0 + 8, 2, l.y1 - l.y0 - 12, "#ffd0d0"); }
}
export const laserOn = (l: { off: number }, t: number) => (t + l.off) % 180 >= 100;
export function drawFaller(c: Ctx, f: { x: number; y: number; st: number; t: number; w: number; h: number; kind?: string }, w: number, cam: number, t: number) {
  const sh = f.st === 1 ? (t % 4 < 2 ? 1 : -1) : 0, x = Math.round(f.x - cam + sh), y = Math.round(f.y);
  if (f.st <= 1 && f.kind !== "ram") line(c, x + f.w / 2, 0, x + f.w / 2, y, 1, "#5a5a60");
  if (f.st === 1 || f.st === 2) { c.globalAlpha = 0.35; R(c, x + 2, 172, f.w - 4, 3, "#000"); c.globalAlpha = 1; }
  if (f.kind === "ram") { drawRam(c, x - 1, y, t); return; }
  if (w === 3) { R(c, x, y, f.w, f.h, "#3a1a4a"); txt(c, "RAM", x + 2, y + 4, "#ff4dd8", 6, "left", null); }
  else { R(c, x, y, f.w, f.h, "#6a5040"); R(c, x, y, f.w, 2, "#9a7a60"); for (let k = 0; k < 3; k++) R(c, x + 2 + k * 6, y + 4, 4, f.h - 6, k % 2 ? "#ffd21f" : "#1a1426"); }
}
