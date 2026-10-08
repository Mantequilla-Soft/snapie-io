// @ts-nocheck — procedural pixel-art sprites. All drawing is code so new sprites are just new functions.
import { R, line, disc, ring, txt, type Ctx } from "./core";
import { WEAP, type Player, type Enemy, type PB, type EB } from "./entities";
import { drawRam } from "./bosses";

export const PAL = { Y: "#ffd21f", Yd: "#d89a00", K: "#1a1426", Kl: "#3a3150", W: "#ffffff", EYE: "#5fe3ff", M: "#9aa3b5", Md: "#5a6275" };

// Snapie, drawn around bottom-center. Pose data comes from player state each frame.
export function drawSnapie(c: Ctx, cx: number, by: number, o: {
  face: number; t: number; run: number; air: number; crouch: boolean; aimX: number; aimY: number; shoot: boolean; flash: boolean; dead: boolean; deathT: number; weapon: string; hurt: boolean; scale?: number;
}) {
  const k = (col: string) => (o.flash ? "#ffffff" : col);
  c.save(); c.translate(Math.round(cx), Math.round(by)); if (o.scale) c.scale(o.scale, o.scale); c.scale(o.face, 1);
  if (o.dead) { c.rotate(Math.min(o.deathT * 0.15, Math.PI / 2) * -1); }
  else if (o.hurt) c.rotate(-0.15);
  const cr = o.crouch ? 7 : 0, by0 = cr;
  // legs
  const ph = o.run * 0.32;
  const legs = (s: number) => {
    let fx: number, fy: number, kx: number;
    if (o.crouch) { fx = s * 4 + 1; fy = 0; kx = s * 3 + 4; }
    else if (o.air < 0) { fx = s * 2 + 3; fy = -6; kx = s * 2 + 5; }
    else if (o.air > 0) { fx = s * 4; fy = 0; kx = s * 3 + 2; }
    else if (o.run > 0) { const p = ph + (s > 0 ? 0 : Math.PI); fx = Math.sin(p) * 5; fy = -Math.max(0, Math.cos(p)) * 3; kx = fx / 2 + 2; }
    else { fx = s * 2.5; fy = 0; kx = s * 2 + 1; }
    const hy = -9 + by0, ky = o.crouch ? -4 : -5 + fy / 2;
    const col = k(s > 0 ? PAL.Md : "#40465a");
    line(c, s * 1.5, hy, kx, ky, 2, col); line(c, kx, ky, fx, fy - 1, 2, col);
    R(c, fx - 2, fy - 2, 5, 2, k(PAL.K)); R(c, kx - 1, ky - 1, 2, 2, k(PAL.Y));
  };
  legs(-1);
  // wings
  const flap = o.air !== 0 ? (o.t % 4 < 2 ? 7 : 2) : (o.t % 20 < 10 ? 5 : 4);
  c.globalAlpha = 0.75; R(c, -9, -21 + by0 - flap + 4, 6, flap, k("#bfefff")); R(c, -6, -19 + by0 - flap + 4, 4, flap, k("#e8fbff")); c.globalAlpha = 1;
  // stinger + torso
  R(c, -7, -11 + by0, 3, 2, k(PAL.K)); R(c, -9, -10 + by0, 2, 1, k(PAL.K));
  R(c, -4, -16 + by0, 8, 8, k(PAL.Y)); R(c, -4, -14 + by0, 8, 2, k(PAL.K)); R(c, -4, -11 + by0, 8, 1, k(PAL.K)); R(c, -4, -9 + by0, 8, 1, k(PAL.Yd));
  legs(1);
  // head
  const hy = -24 + by0;
  R(c, -4, hy + 1, 9, 7, k(PAL.Y)); R(c, -3, hy, 7, 1, k(PAL.Y)); R(c, -4, hy + 2, 9, 1, k(PAL.K)); R(c, -3, hy + 7, 7, 1, k(PAL.Yd));
  const ea = o.aimY * 1;
  if (o.dead) { R(c, 1, hy + 3, 1, 1, k(PAL.K)); R(c, 3, hy + 5, 1, 1, k(PAL.K)); R(c, 3, hy + 3, 1, 1, k(PAL.K)); R(c, 1, hy + 5, 1, 1, k(PAL.K)); }
  else { R(c, 0, hy + 3, 5, 4, k(PAL.W)); R(c, 2 + Math.round(o.aimX), hy + 4 + Math.round(ea), 2, 2, k(o.hurt ? "#ff3b3b" : PAL.EYE)); R(c, 0, hy + 3, 5, 1, k(PAL.K)); }
  const bob = o.t % 30 < 15 ? 0 : 1;
  line(c, -1, hy, -3, hy - 4 + bob, 1, k(PAL.K)); line(c, 2, hy, 3, hy - 4 - bob, 1, k(PAL.K)); R(c, -4, hy - 5 + bob, 2, 2, k(PAL.Y)); R(c, 3, hy - 5 - bob, 2, 2, k(PAL.Y));
  // cannon arm
  if (!o.dead) {
    const sx = 1, sy = -14 + by0, len = o.weapon === "bazooka" ? 10 : 9, back = o.shoot ? 1.5 : 0;
    const ex = sx + o.aimX * (len - back), ey = sy + o.aimY * (len - back);
    const wc = WEAP[o.weapon]?.col || PAL.Y;
    line(c, sx, sy, sx + o.aimX * 4, sy + o.aimY * 4, 3, k(PAL.K));
    line(c, sx + o.aimX * 3, sy + o.aimY * 3, ex, ey, o.weapon === "bazooka" ? 4 : 3, k(PAL.Md));
    R(c, ex - 1, ey - 1, 3, 3, k(wc));
    if (o.shoot) { R(c, ex + o.aimX * 3 - 2, ey + o.aimY * 3 - 2, 5, 5, "#fff6c0"); R(c, ex + o.aimX * 5 - 1, ey + o.aimY * 5 - 1, 3, 3, wc); }
  }
  c.restore();
}

export function drawPlayer(c: Ctx, p: Player, cx: number) {
  if (!p.dead && p.inv > 0 && p.hurtT === 0 && Math.floor(p.inv / 3) % 2 === 0) return;
  const air = p.onGround ? 0 : p.vy < 0 ? -1 : 1;
  const ax = p.aimX * p.face; // local-space aim (face handled by scale)
  drawSnapie(c, p.x + p.w / 2 - cx, p.y + p.h + (p.crouch ? 0 : 0), {
    face: p.face, t: p.t, run: p.onGround && p.vx !== 0 ? p.runT : 0, air, crouch: p.crouch,
    aimX: ax === 0 && p.aimY === 0 ? 1 : ax, aimY: p.aimY, shoot: p.shootT > 4, flash: p.hurtT > 0 && p.hurtT % 4 < 2, dead: p.dead, deathT: p.deathT, weapon: p.wpn.id, hurt: p.hurtT > 0,
  });
  if (p.pickT > 0) ring(c, p.x + p.w / 2 - cx, p.y + p.h / 2, 20 - p.pickT / 3, p.pickT % 4 < 2 ? "#fff" : "#ffd21f", 14, 2, p.t * 0.2);
  if (p.switchT > 0) txt(c, WEAP[p.wpn.id].name, p.x + p.w / 2 - cx, p.y - 18, WEAP[p.wpn.id].col, 6, "center");
}

export function drawEnemy(c: Ctx, e: Enemy, cx: number, t: number) {
  const fl = e.flash > 0, k = (col: string) => (fl ? "#ffffff" : col);
  const x = Math.round(e.x - cx), y = Math.round(e.y), f = e.face;
  switch (e.type) {
    case "drone": {
      R(c, x + 1, y + 3, 12, 6, k("#7a8296")); R(c, x + 1, y + 3, 12, 1, k("#b8c0d0")); R(c, x + 3, y + 9, 8, 1, k("#40465a"));
      R(c, x + (f > 0 ? 8 : 2), y + 4, 4, 3, k(e.st > 0 ? "#ffffff" : "#ff2a2a"));
      const pw = t % 4 < 2 ? 12 : 4; R(c, x + 7 - pw / 2, y, pw, 1, k("#c8ccd8")); R(c, x + 6, y + 1, 2, 2, k("#40465a"));
      R(c, x + 5, y + 10, 4, 2, k("#40465a"));
      break;
    }
    case "term": {
      c.save(); c.translate(x + 6, y); c.scale(f, 1);
      const walk = e.onGround && e.vx !== 0 ? e.t * 0.25 : 0;
      for (const s of [-1, 1]) { const fx = walk ? Math.sin(walk + (s > 0 ? 0 : 3.14)) * 4 : s * 2; line(c, s * 2, 15, fx, 21, 3, k(s > 0 ? "#6a5a4a" : "#4a3e34")); R(c, fx - 2, 20, 5, 2, k("#2a2420")); }
      R(c, -5, 7, 10, 9, k("#7a6a5a")); R(c, -5, 7, 10, 1, k("#a8907a")); R(c, -3, 10, 2, 2, k("#c04a1a")); R(c, 2, 12, 2, 1, k("#3a2a20"));
      R(c, -5, -1, 10, 8, k("#8a8a80")); R(c, -6, 1, 1, 4, k("#6a6a60"));
      R(c, 0, 1, 4, 3, k("#ff2a2a")); R(c, -4, 2, 2, 2, k("#ffd21f")); R(c, -4, 5, 9, 2, k("#2a2420")); for (let i = 0; i < 4; i++) R(c, -3 + i * 2, 5, 1, 1, k("#e8e0c0"));
      R(c, -2, -3, 1, 2, k("#5a5a50")); R(c, 1, -4, 1, 3, k("#5a5a50"));
      R(c, 2, 9, 8, 3, k("#4a4a50")); if (e.st > 0) R(c, 10, 9, 3, 3, "#fff6c0");
      c.restore(); break;
    }
    case "dog": {
      c.save(); c.translate(x + 10, y); c.scale(f, 1);
      const g = e.onGround ? e.t * 0.45 : 0;
      for (const [lx, o] of [[-7, 0], [-4, 2], [5, 1], [8, 3]] as const) { const sw = e.onGround ? Math.sin(g + o) * 3 : (lx < 0 ? -3 : 3); line(c, lx, 7, lx + sw, 11, 2, k(o % 2 ? "#40465a" : "#5a6275")); }
      R(c, -9, 2, 16, 6, k("#8a92a8")); R(c, -9, 2, 16, 1, k("#c0c8d8")); R(c, -6, 4, 10, 1, k("#40465a"));
      R(c, 5, -2, 7, 6, k("#8a92a8")); R(c, 8, 0, 2, 2, k("#ff2a2a"));
      const jaw = e.st > 0 || t % 16 < 8 ? 2 : 0; R(c, 9, 4 + jaw, 5, 2, k("#5a6275")); R(c, 10, 4, 1, jaw, k("#fff"));
      R(c, 6, -4, 2, 3, k("#5a6275"));
      line(c, -9, 3, -13, -2 + (t % 8 < 4 ? 0 : 2), 1, k("#5a6275")); R(c, -14, -3, 2, 2, k("#ff2a2a"));
      c.restore(); break;
    }
    case "orb": {
      const cxx = x + 7, cyy = y + 7, ch = e.st > 0;
      for (let i = 0; i < 3; i++) { const wob = Math.sin(t * 0.2 + i * 2) * 3; line(c, cxx - 4 + i * 4, cyy + 5, cxx - 4 + i * 4 + wob, cyy + 12, 1, k("#7a3a9a")); }
      disc(c, cxx, cyy, 7, k(ch && t % 4 < 2 ? "#ffffff" : "#5a2a7a")); disc(c, cxx - 1, cyy - 2, 4, k("#9a5aca"));
      const bl = t % 90 < 6; R(c, cxx - 3, cyy - 2, 6, bl ? 1 : 5, k("#ffe04a")); if (!bl) R(c, cxx - 1, cyy - 1, 2, 3, k("#1a1426"));
      ring(c, cxx, cyy, 10 + Math.sin(t * 0.1) * 1.5, k(ch ? "#ff2a6d" : "#c09aff"), 3, 2, t * (ch ? 0.3 : 0.07));
      ring(c, cxx, cyy, 12, k("#5fe3ff"), 2, 1, -t * 0.05);
      break;
    }
    case "para": {
      c.save(); c.translate(x + 5, y); c.scale(f, 1);
      R(c, -5, 1, 10, 6, k("#2a6a3a")); R(c, -5, 1, 10, 1, k("#5fca6a"));
      for (let i = 0; i < 4; i++) { const sw = e.onGround || e.attached ? (t + i) % 6 < 3 ? 1 : 0 : 1; R(c, -4 + i * 3, 7 + sw, 1, 2, k("#c0c0c0")); }
      R(c, -1, 2, 2, 2, k("#ff2a2a")); R(c, 2, 2, 2, 2, k("#ff2a2a"));
      const m = t % 10 < 5 ? 2 : 0; R(c, 3, 4, 3, 1, k("#e8e0c0")); R(c, 3, 5 + m, 3, 1, k("#e8e0c0"));
      txt(c, "01", -4, 2, k("#7dff6a"), 4, "left", null);
      c.restore(); break;
    }
    case "turret": {
      R(c, x, y + 6, 14, 8, k("#40465a")); R(c, x, y + 6, 14, 1, k("#7a8296")); R(c, x + 2, y + 12, 10, 2, k("#ffd21f"));
      disc(c, x + 7, y + 7, 5, k("#5a6275")); const a = e.tx; line(c, x + 7, y + 7, x + 7 + Math.cos(a) * 10, y + 7 + Math.sin(a) * 10, 3, k("#1a1426"));
      R(c, x + 6, y + 6, 2, 2, k(e.st > 0 ? "#ffffff" : t % 30 < 15 ? "#ff2a2a" : "#801010"));
      break;
    }
    case "ram": {
      c.globalAlpha = 0.4; for (let i = 1; i < 4; i++) R(c, x + 11 - i * 6, y + 3, 6, 2, "#7dff6a"); c.globalAlpha = 1;
      if (fl) R(c, x, y, 22, 9, "#fff"); else drawRam(c, x, y, t);
      break;
    }
  }
}

export function drawPB(c: Ctx, b: PB, cx: number, t: number) {
  const x = b.x - cx, y = b.y;
  switch (b.k) {
    case "sting": R(c, x - 1, y - 1, 3, 3, "#ffd21f"); R(c, x, y, 1, 1, "#fff"); break;
    case "laser": { const l = 10 + b.lvl * 4, n = Math.hypot(b.vx, b.vy); line(c, x, y, x - (b.vx / n) * l, y - (b.vy / n) * l, 3 + (b.lvl > 2 ? 1 : 0), "#5fe3ff"); line(c, x, y, x - (b.vx / n) * l, y - (b.vy / n) * l, 1, "#ffffff"); break; }
    case "spread": disc(c, x, y, 2.5, t % 4 < 2 ? "#ff4d6d" : "#ff9aa8"); R(c, x - 1, y - 1, 2, 2, "#fff"); break;
    case "bazooka": { const a = Math.atan2(b.vy, b.vx); line(c, x, y, x - Math.cos(a) * 7, y - Math.sin(a) * 7, 4, "#3a7a2a"); R(c, x - 1, y - 1, 3, 3, "#7dff6a"); R(c, x - Math.cos(a) * 9 - 2, y - Math.sin(a) * 9 - 2, 4, 4, t % 2 ? "#ffd21f" : "#ff6a00"); break; }
  }
}
export function drawEB(c: Ctx, b: EB, cx: number, t: number) {
  const x = b.x - cx, y = b.y;
  switch (b.k) {
    case "bomb": disc(c, x, y, 4, "#6a4a1a"); R(c, x - 2, y - 2, 2, 2, "#ffd21f"); txt(c, "1", x - 2, y - 2, "#7dff6a", 4, "left", null); break;
    case "slag": disc(c, x, y, 5, "#ff6a00"); disc(c, x - 1, y - 1, 3, "#ffd27a"); break;
    case "wave": R(c, x - 5, y - 6 - (t % 4), 10, 10 + (t % 4), "#5fe3ff"); R(c, x - 3, y - 4, 6, 8, "#ffffff"); break;
    case "fire": R(c, x - 3, y - 6 - (t % 3), 6, 8, "#ff6a00"); R(c, x - 1, y - 4, 2, 4, "#ffd27a"); break;
    case "ping": ring(c, x, y, 3 + (b.t % 10) / 4, "#5fe3ff", 8, 1); R(c, x - 1, y - 1, 2, 2, "#fff"); break;
    case "packet": R(c, x - 3, y - 3, 7, 6, "#ff2a6d"); R(c, x - 2, y - 2, 5, 1, "#ffb0d0"); txt(c, "?", x - 2, y - 2, "#fff", 4, "left", null); break;
    default: disc(c, x, y, 2.5, t % 6 < 3 ? "#ff3b3b" : "#ffb000"); R(c, x - 1, y - 1, 2, 2, "#fff6c0");
  }
}

export interface FX { x: number; y: number; t: number; s: number }
export function drawFX(c: Ctx, f: FX, cx: number) {
  const x = f.x - cx, y = f.y, t = f.t, s = f.s;
  const cols = ["#ffffff", "#fff6a0", "#ffd21f", "#ff8a00", "#ff3b1a", "#8a2a1a", "#4a4a4a"];
  const i = Math.min(cols.length - 1, Math.floor(t / 3));
  const r = s * (3 + t * 0.9);
  if (t < 18) disc(c, x, y, r, cols[i]);
  if (t < 12) disc(c, x, y, r * 0.5, cols[Math.max(0, i - 2)]);
  ring(c, x, y, r * 1.3, cols[Math.min(6, i + 1)], 10, Math.max(2, Math.round(s * 2)), t * 0.1);
}

export function drawItem(c: Ctx, it: { x: number; y: number; item: string; t: number }, cx: number) {
  const x = Math.round(it.x - cx), y = Math.round(it.y + Math.sin(it.t * 0.1) * 1);
  if (it.item === "H") { R(c, x + 2, y + 2, 3, 3, "#ff3b5b"); R(c, x + 7, y + 2, 3, 3, "#ff3b5b"); R(c, x + 1, y + 4, 10, 3, "#ff3b5b"); R(c, x + 3, y + 7, 6, 2, "#ff3b5b"); R(c, x + 5, y + 9, 2, 1, "#ff3b5b"); R(c, x + 3, y + 3, 1, 1, "#fff"); return; }
  const w = WEAP[({ T: "sting", L: "laser", S: "spread", B: "bazooka" } as any)[it.item]];
  R(c, x - 1, y - 1, 14, 14, it.t % 10 < 5 ? "#ffffff" : "#1a1426"); R(c, x, y, 12, 12, w.col); R(c, x + 1, y + 1, 10, 10, "#1a1426");
  txt(c, it.item, x + 2, y + 2, w.col, 8, "left", null);
}
export function drawCap(c: Ctx, cp: { x: number; y: number; t: number }, cx: number) {
  const x = Math.round(cp.x - cx), y = Math.round(cp.y), t = cp.t, fl = t % 4 < 2 ? 5 : 2;
  R(c, x - 6, y + 1 - fl / 2, 5, fl, "#bfefff"); R(c, x + 15, y + 1 - fl / 2, 5, fl, "#bfefff");
  R(c, x, y - 4, 14, 10, "#c8ccd8"); R(c, x, y - 4, 14, 2, "#ffffff"); R(c, x + 2, y + 6, 10, 2, "#5a6275");
  R(c, x + 4, y - 2, 6, 6, t % 20 < 10 ? "#ff2a6d" : "#ffd21f"); txt(c, "?", x + 4, y - 2, "#1a1426", 6, "left", null);
}
