'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import {
  LuArrowBigUpDash,
  LuMagnet,
  LuPause,
  LuPlay,
  LuShield,
  LuVolume2,
  LuVolumeX,
} from "react-icons/lu";

import { createEngine, type SnapieJumpEngine } from "./game/engine";
import { useFullscreen, usePortraitOrientation } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import type {
  SnapieControls,
  SnapieEvent,
  SnapieJumpHud,
  SnapieJumpResult,
  SnapieOptions,
} from "./types";
import styles from "./SnapieJump.module.css";

const MUTE_KEY = "snapie-jump:muted";

export type SnapieJumpProps = Omit<SnapieOptions, "onResult"> & {
  className?: string;
  onResult?: (r: SnapieJumpResult) => void;
  /** Shows a "Back to arcade" button on the game-over screen. */
  onBackToArcade?: () => void;
  /** Extra content on the game-over screen (e.g. score submission). */
  resultSlot?: ReactNode;
};

/** True when a key press landed on something the user can activate themselves. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("button, a, input, textarea, select") !== null;
}

export const SnapieJump = forwardRef<SnapieControls, SnapieJumpProps>(function SnapieJump(
  {
    playerName,
    sessionId,
    autoStart = false,
    showMenus = true,
    keyboard = true,
    onEvent,
    onResult,
    onBackToArcade,
    resultSlot,
    className,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SnapieJumpEngine | null>(null);
  // The engine is created once, but the host issues a fresh sessionId after each
  // run (scores are deduped per sessionId). The engine reads these through
  // getters at result time instead of capturing the first value.
  const cbRef = useRef({ onEvent, onResult, playerName, sessionId });
  cbRef.current = { onEvent, onResult, playerName, sessionId };

  const [hud, setHud] = useState<SnapieJumpHud | null>(null);
  const [result, setResult] = useState<SnapieJumpResult | null>(null);
  const [muted, setMuted] = useState(false);

  const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen(wrapRef);
  const isPortrait = usePortraitOrientation();
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const phase = hud?.phase ?? "idle";
  useWakeLock(phase === "running");

  useImperativeHandle(ref, () => ({
    start: () => { setResult(null); engineRef.current?.start(); },
    pause: () => engineRef.current?.pause(),
    resume: () => engineRef.current?.resume(),
    reset: () => { setResult(null); engineRef.current?.reset(); },
    getPhase: () => engineRef.current?.getPhase() ?? "idle",
    getHud: () => engineRef.current?.getHud() ?? null,
  }));

  // engine lifecycle: exactly one engine + loop per mount
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const engine = createEngine(canvas, {
      get playerName() {
        return cbRef.current.playerName;
      },
      get sessionId() {
        return cbRef.current.sessionId;
      },
      onEvent: (e: SnapieEvent) => {
        cbRef.current.onEvent?.(e);
        if (e.type === "hud") setHud(e.hud as SnapieJumpHud);
        if (e.type === "game-over") setResult(e.result as SnapieJumpResult);
      },
      onResult: (r) => cbRef.current.onResult?.(r),
    });
    engineRef.current = engine;
    setHud(engine.getHud());
    try {
      const m = localStorage.getItem(MUTE_KEY) === "1";
      setMuted(m);
      engine.setMuted(m);
    } catch { /* ignore */ }

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) engine.resize(r.width, r.height);
    });
    ro.observe(wrap);
    if (autoStart) engine.start();
    return () => {
      ro.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startOrRestart = () => {
    setResult(null);
    engineRef.current?.start();
  };

  // keyboard
  useEffect(() => {
    if (!keyboard) return;
    const keys = { left: false, right: false };
    const map = (k: string) => (k === "ArrowLeft" || k === "a" || k === "A" ? "left" : k === "ArrowRight" || k === "d" || k === "D" ? "right" : null);
    const down = (e: KeyboardEvent) => {
      const e2 = engineRef.current;
      if (!e2) return;
      const dir = map(e.key);
      if (dir) { keys[dir] = true; e2.setKeys(keys.left, keys.right); e.preventDefault(); return; }
      const ph = e2.getPhase();
      if (e.key === " " || e.key === "Enter") {
        // A focused button (Save Score, Play again...) handles Space/Enter itself.
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
        if (ph === "idle" || ph === "game-over") startOrRestart();
        else if (ph === "paused") e2.resume();
      }
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        if (ph === "running") e2.pause(); else if (ph === "paused") e2.resume();
      }
    };
    const up = (e: KeyboardEvent) => {
      const dir = map(e.key);
      if (dir) { keys[dir] = false; engineRef.current?.setKeys(keys.left, keys.right); }
    };
    const blur = () => { keys.left = keys.right = false; engineRef.current?.setKeys(false, false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboard]);

  // relative drag: finger delta moves the steering target, so one thumb anywhere works
  const drag = useRef<{ id: number; startX: number; playerX: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng || eng.getPhase() !== "running") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, playerX: eng.getPlayerX() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const eng = engineRef.current;
    if (!d || !eng || d.id !== e.pointerId) return;
    const dxWorld = ((e.clientX - d.startX) / eng.getScale()) * 1.4;
    eng.setPointerTarget(d.playerX + dxWorld);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    engineRef.current?.setPointerTarget(null);
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    engineRef.current?.setMuted(m);
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
  };

  // Buttons sit on top of the drag surface; keep their presses out of it.
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const muteButton = (
    <button
      type="button"
      aria-label={muted ? "Unmute" : "Mute"}
      className={styles.hudBtn}
      onPointerDown={stop}
      onClick={toggleMute}
    >
      {muted ? <LuVolumeX size={18} /> : <LuVolume2 size={18} />}
    </button>
  );

  const fullscreenButton = fullscreenSupported ? (
    <button
      type="button"
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      className={styles.hudBtn}
      onPointerDown={stop}
      onClick={toggleFullscreen}
      style={{ fontSize: 16, fontWeight: 700 }}
    >
      {isFullscreen ? "⤡" : "⤢"}
    </button>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={`${styles.root} ${isFullscreen ? styles.rootFullscreen : ""} ${className ?? ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className={styles.canvas} />

      {isFullscreen && isPortrait && isTouch && (
        <div className={styles.rotateHint}>ROTATE YOUR DEVICE FOR THE FULL EXPERIENCE</div>
      )}

      {showMenus && hud && (phase === "running" || phase === "dying" || phase === "paused") && (
        <div className={styles.hudBar}>
          <div className={styles.hudPill}>
            <Stat label="HEIGHT" value={`${hud.height}m`} />
            <span className={styles.hudSep} />
            <Stat label="SCORE" value={hud.score.toLocaleString()} />
            <span className={styles.hudSep} />
            <Stat label="HONEY" value={String(hud.honey)} />
          </div>
          <div className={styles.hudButtons}>
            {fullscreenButton}
            {muteButton}
            <button
              type="button"
              aria-label={phase === "paused" ? "Resume" : "Pause"}
              className={styles.hudBtn}
              onPointerDown={stop}
              onClick={() => (phase === "paused" ? engineRef.current?.resume() : engineRef.current?.pause())}
            >
              {phase === "paused" ? <LuPlay size={18} /> : <LuPause size={18} />}
            </button>
          </div>
        </div>
      )}

      {showMenus && hud && phase === "running" && (hud.superJump > 0 || hud.magnet > 0 || hud.shield) && (
        <div className={styles.powerStack}>
          {hud.superJump > 0 && (
            <span className={`${styles.powerTag} ${styles.powerSuper}`}>
              <LuArrowBigUpDash size={14} />
              {Math.ceil(hud.superJump)}s
            </span>
          )}
          {hud.magnet > 0 && (
            <span className={`${styles.powerTag} ${styles.powerMagnet}`}>
              <LuMagnet size={14} />
              {Math.ceil(hud.magnet)}s
            </span>
          )}
          {hud.shield && (
            <span className={`${styles.powerTag} ${styles.powerShield}`}>
              <LuShield size={14} />
              ON
            </span>
          )}
        </div>
      )}

      {showMenus && phase === "idle" && (
        <div className={styles.idle}>
          <div>
            <p className={styles.kicker}>A SNAPIE ARCADE GAME</p>
            <h1 className={styles.title}>
              Snapie<br />Jump
            </h1>
            <p className={styles.tagline}>Bounce. Climb. Grab the honey.</p>
          </div>
          <div className={styles.idleBottom}>
            <button type="button" className={styles.btnHoney} onPointerDown={stop} onClick={startOrRestart}>
              PLAY
            </button>
            <p className={styles.hint}>← → / A D · or drag anywhere</p>
            {hud && hud.best > 0 && <p className={styles.best}>BEST {hud.best.toLocaleString()}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              {fullscreenButton}
              {muteButton}
            </div>
          </div>
        </div>
      )}

      {showMenus && phase === "paused" && (
        <div className={styles.scrim}>
          <h2 className={styles.pausedTitle}>Paused</h2>
          <button type="button" className={styles.btnHoney} onPointerDown={stop} onClick={() => engineRef.current?.resume()}>
            RESUME
          </button>
        </div>
      )}

      {showMenus && phase === "game-over" && result && (
        <div className={styles.scrim}>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>GAME OVER</h2>
            {result.meta.isNewBest && <p className={styles.newBest}>NEW HIGH SCORE!</p>}
            <dl className={styles.rows}>
              <Row k="Height" v={`${result.meta.height} m`} />
              <Row k="Score" v={result.score.toLocaleString()} />
              <Row k="Honey" v={String(result.meta.honey)} />
              <Row k="Best" v={(hud?.best ?? result.score).toLocaleString()} />
            </dl>
            {resultSlot && <div className={styles.slot}>{resultSlot}</div>}
            <div className={styles.actions}>
              <button type="button" className={styles.btnHoney} onPointerDown={stop} onClick={startOrRestart}>
                PLAY AGAIN
              </button>
              {onBackToArcade && (
                <button type="button" className={styles.btnGhost} onPointerDown={stop} onClick={onBackToArcade}>
                  BACK TO ARCADE
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className={styles.row}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
