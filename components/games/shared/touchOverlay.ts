/**
 * Shared touch controls for Snapie games. See docs/games-mobile.md.
 *
 * - "overlay" mode (fullscreen): translucent controls float over the game in
 *   the bottom corners of the screen, padded by the safe-area insets.
 * - "bar" mode (inline): a plain row below the canvas, so a small portrait
 *   canvas isn't covered by its own controls.
 *
 * The left control is a single virtual D-pad zone (slide your thumb between
 * directions, diagonals work); the right is a cluster of action buttons.
 * Every control tracks its own pointer, so two thumbs work at once.
 */

export interface TouchAction {
  label: string;
  /** KeyboardEvent.code-style value passed to `press`/`release`. */
  code: string;
  /** Extra codes held while this button is held (e.g. menus confirm with Enter). */
  alsoPress?: string[];
  /** Larger, accented primary button. */
  primary?: boolean;
}

export interface TouchOverlayOptions {
  press: (code: string) => void;
  release: (code: string) => void;
  dpad: { left: string; right: string; up: string; down: string };
  actions: TouchAction[];
  /** Small top-corner buttons (pause). Overlay mode only; shown in the bar otherwise. */
  system?: TouchAction[];
  /** Called on every touch, for unlocking audio. */
  onTouch?: () => void;
}

export type TouchOverlayMode = "overlay" | "bar";

export interface TouchOverlayHandle {
  el: HTMLElement;
  setMode(mode: TouchOverlayMode): void;
  destroy(): void;
}

const ACCENT = "#ffd21f";
const EDGE = "#3a3150";
const FILL = "rgba(26,20,38,0.62)";
const FILL_DOWN = "rgba(255,210,31,0.55)";
const DPAD_SIZE = 150;
const DEADZONE = 0.3;

const BASE_CSS = "user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;";

export function createTouchOverlay(host: HTMLElement, opts: TouchOverlayOptions): TouchOverlayHandle {
  const el = document.createElement("div");
  el.style.cssText = `${BASE_CSS}font:10px 'Press Start 2P',monospace;`;
  const left = document.createElement("div");
  const right = document.createElement("div");
  const top = document.createElement("div");
  el.append(top, left, right);
  host.appendChild(el);

  const held = new Set<string>();
  const hold = (code: string, on: boolean, extra: string[] = []) => {
    for (const c of [code, ...extra]) {
      if (on) { if (!held.has(c)) { held.add(c); opts.press(c); } }
      else if (held.delete(c)) opts.release(c);
    }
  };

  // ---- D-pad: one zone, direction from where the thumb is ----
  const pad = document.createElement("div");
  pad.style.cssText = `${BASE_CSS}position:relative;width:${DPAD_SIZE}px;height:${DPAD_SIZE}px;border-radius:50%;border:2px solid ${EDGE};background:${FILL};`;
  pad.dataset.touch = "dpad";
  const knob = document.createElement("div");
  knob.style.cssText = `position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,210,31,0.28);border:2px solid ${ACCENT};pointer-events:none;`;
  pad.appendChild(knob);
  for (const [txt, pos] of [["▲", "top:6px;left:50%;transform:translateX(-50%)"], ["▼", "bottom:6px;left:50%;transform:translateX(-50%)"], ["◀", "left:8px;top:50%;transform:translateY(-50%)"], ["▶", "right:8px;top:50%;transform:translateY(-50%)"]]) {
    const a = document.createElement("span");
    a.textContent = txt; a.style.cssText = `position:absolute;${pos};color:${ACCENT};opacity:.7;pointer-events:none;`;
    pad.appendChild(a);
  }
  let padPointer: number | null = null;
  const aim = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const half = r.width / 2 || DPAD_SIZE / 2;
    const dx = (e.clientX - (r.left + half)) / half, dy = (e.clientY - (r.top + half)) / half;
    hold(opts.dpad.left, dx < -DEADZONE); hold(opts.dpad.right, dx > DEADZONE);
    hold(opts.dpad.up, dy < -DEADZONE); hold(opts.dpad.down, dy > DEADZONE);
    const m = Math.hypot(dx, dy) || 1, k = Math.min(1, m);
    knob.style.transform = `translate(${(dx / m) * k * half * 0.5}px,${(dy / m) * k * half * 0.5}px)`;
  };
  const padEnd = (e: PointerEvent) => {
    if (e.pointerId !== padPointer) return;
    padPointer = null;
    for (const c of [opts.dpad.left, opts.dpad.right, opts.dpad.up, opts.dpad.down]) hold(c, false);
    knob.style.transform = "";
  };
  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault(); opts.onTouch?.();
    if (padPointer !== null) return;
    padPointer = e.pointerId; pad.setPointerCapture?.(e.pointerId); aim(e);
  });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === padPointer) aim(e); });
  pad.addEventListener("pointerup", padEnd);
  pad.addEventListener("pointercancel", padEnd);
  left.appendChild(pad);

  // ---- action buttons ----
  const button = (a: TouchAction, size: number) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a.label; b.setAttribute("aria-label", a.code);
    const base = `${BASE_CSS}min-width:${size}px;height:${size}px;padding:0 8px;border-radius:${a.primary ? "50%" : "12px"};border:2px solid ${a.primary ? ACCENT : EDGE};background:${FILL};color:${ACCENT};font:inherit;`;
    b.style.cssText = base;
    let id: number | null = null;
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null; b.style.cssText = base; hold(a.code, false, a.alsoPress);
    };
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault(); opts.onTouch?.();
      if (id !== null) return;
      id = e.pointerId; b.setPointerCapture?.(e.pointerId);
      b.style.cssText = `${base}background:${FILL_DOWN};transform:scale(.94);`;
      hold(a.code, true, a.alsoPress);
    });
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", end);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  };
  const primary = opts.actions.filter((a) => a.primary), secondary = opts.actions.filter((a) => !a.primary);
  const cluster = document.createElement("div");
  cluster.style.cssText = "display:flex;align-items:flex-end;gap:10px;";
  const small = document.createElement("div");
  small.style.cssText = "display:flex;flex-direction:column;gap:10px;";
  for (const a of secondary) small.appendChild(button(a, 52));
  for (const a of primary) cluster.appendChild(button(a, 76));
  cluster.prepend(small);
  right.appendChild(cluster);
  for (const a of opts.system ?? []) top.appendChild(button(a, 40));

  // ---- layout per mode ----
  const setMode = (mode: TouchOverlayMode) => {
    // Release anything held across a layout swap, so no input sticks.
    for (const c of [...held]) hold(c, false);
    if (mode === "overlay") {
      // Fixed inside the fullscreen element = the whole screen, so in portrait
      // the controls land on the letterbox instead of covering the picture.
      const inset = "max(12px,env(safe-area-inset-";
      el.style.cssText = `${BASE_CSS}font:10px 'Press Start 2P',monospace;position:fixed;inset:0;z-index:5;pointer-events:none;`;
      top.style.cssText = `position:absolute;top:${inset}top))};left:${inset}left))};pointer-events:auto;display:flex;gap:8px;`;
      left.style.cssText = `position:absolute;bottom:${inset}bottom))};left:${inset}left))};pointer-events:auto;`;
      right.style.cssText = `position:absolute;bottom:${inset}bottom))};right:${inset}right))};pointer-events:auto;`;
    } else {
      el.style.cssText = `${BASE_CSS}font:10px 'Press Start 2P',monospace;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px;`;
      top.style.cssText = "display:flex;gap:8px;";
      left.style.cssText = ""; right.style.cssText = "";
    }
  };
  setMode("bar");
  // In bar mode the system buttons sit between the two clusters.
  el.insertBefore(top, right);

  return {
    el, setMode,
    destroy() { for (const c of [...held]) hold(c, false); el.remove(); },
  };
}
