// @ts-nocheck — game engine code: strict index checks are relaxed for hot-loop array math.
export const W = 384, H = 216, T = 16, ROWS = 14;
export type Ctx = CanvasRenderingContext2D;
export interface Box { x: number; y: number; w: number; h: number; weak?: boolean }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function R(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, t: number, col: string) {
  c.fillStyle = col;
  const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= d; i++) {
    const x = x0 + ((x1 - x0) * i) / d, y = y0 + ((y1 - y0) * i) / d;
    c.fillRect(Math.round(x - t / 2), Math.round(y - t / 2), t, t);
  }
}
export function disc(c: Ctx, cx: number, cy: number, r: number, col: string) {
  c.fillStyle = col;
  const rr = Math.round(r);
  for (let y = -rr; y <= rr; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
    c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
export function ring(c: Ctx, cx: number, cy: number, r: number, col: string, n = 16, s = 2, rot = 0) {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(a) * r - s / 2), Math.round(cy + Math.sin(a) * r - s / 2), s, s);
  }
}

export const FONT = '"Press Start 2P", monospace';
export function txt(c: Ctx, s: string, x: number, y: number, col = "#fff", size = 8, align: CanvasTextAlign = "left", sh: string | null = "#000") {
  c.font = `${size}px ${FONT}`; c.textAlign = align; c.textBaseline = "top";
  if (sh) { c.fillStyle = sh; c.fillText(s, Math.round(x) + 1, Math.round(y) + 1); }
  c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y));
}

const MAP: Record<string, string[]> = {
  left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"],
  jump: ["Space", "KeyZ"], shoot: ["KeyJ", "KeyX"], switch: ["KeyK", "KeyC"],
  start: ["Enter", "NumpadEnter"], pause: ["KeyP", "Escape"],
};
export class Input {
  down = new Set<string>(); pressed = new Set<string>();
  private kd = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.press(e.code);
  };
  private ku = (e: KeyboardEvent) => this.release(e.code);
  private bl = () => this.down.clear();
  constructor(public keyboard = true) {
    if (keyboard) { window.addEventListener("keydown", this.kd); window.addEventListener("keyup", this.ku); }
    window.addEventListener("blur", this.bl);
  }
  press(code: string) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
  release(code: string) { this.down.delete(code); }
  destroy() { window.removeEventListener("keydown", this.kd); window.removeEventListener("keyup", this.ku); window.removeEventListener("blur", this.bl); }
  is(a: string) { return MAP[a].some((k) => this.down.has(k)); }
  hit(a: string) { return MAP[a].some((k) => this.pressed.has(k)); }
  confirm() { return this.hit("start") || this.hit("shoot") || this.hit("jump"); }
  end() { this.pressed.clear(); }
}
