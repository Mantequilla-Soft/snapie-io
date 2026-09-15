'use client';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { BlastEngine, GAME_ID, GAME_VERSION, VIEW_H, VIEW_W, type EngineHud, type Phase } from "./game/engine";
import { RULES } from "./game/waves";
import { useFullscreen, usePortraitOrientation } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import type { SnapieControls, SnapieOptions, SnapieResult } from "./types";

const PAL = {
  bg: "#1a1c2c",
  panel: "#12131f",
  light: "#f4f4f4",
  orange: "#ef7d57",
  green: "#38b764",
  cyan: "#73eff7",
  dim: "#5d5d81",
};

const MONO = '"Press Start 2P", ui-monospace, SFMono-Regular, Menlo, monospace';

export type SnapieBlastProps = SnapieOptions & {
  className?: string;
  /** Extra content on the game-over / win screen (e.g. score submission). */
  resultSlot?: ReactNode;
};

export const SnapieBlast = forwardRef<SnapieControls, SnapieBlastProps>(function SnapieBlast(
  {
    playerName,
    sessionId,
    startStage = 1,
    autoStart = false,
    showMenus = true,
    showTouchControls = "auto",
    keyboard = true,
    maxWidth = 640,
    onEvent,
    onResult,
    className,
    resultSlot,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BlastEngine | null>(null);
  const cbRef = useRef({ onEvent, onResult, playerName, sessionId });
  cbRef.current = { onEvent, onResult, playerName, sessionId };

  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<EngineHud | null>(null);
  const [result, setResult] = useState<SnapieResult | null>(null);
  const [muted, setMuted] = useState(false);

  const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const isPortrait = usePortraitOrientation();
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  useWakeLock(phase === "playing");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;

    const engine = new BlastEngine(canvas, {
      onPhase: setPhase,
      onHud: (h) => setHud(h),
      onStageClear: (stage, score) => cbRef.current.onEvent?.({ type: "stage-clear", stage, score }),
      onGameOver: (summary) => {
        const r: SnapieResult = {
          gameId: GAME_ID,
          gameVersion: GAME_VERSION,
          sessionId: cbRef.current.sessionId,
          playerName: cbRef.current.playerName,
          score: summary.score,
          stage: summary.stage,
          stagesCleared: summary.stagesCleared,
          won: summary.won,
          durationMs: summary.durationMs,
          endedAt: summary.endedAt,
          replayToken: summary.replayToken,
        };
        setResult(r);
        cbRef.current.onEvent?.(summary.won ? { type: "win", result: r } : { type: "game-over", result: r });
        cbRef.current.onResult?.(r);
      },
    });
    engineRef.current = engine;
    engine.run();
    setHud(engine.hud());
    cbRef.current.onEvent?.({ type: "ready" });

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud) cbRef.current.onEvent?.({ type: "hud", hud });
  }, [hud]);

  const startRun = useCallback(
    (stage = startStage) => {
      const engine = engineRef.current;
      if (!engine) return;
      setResult(null);
      engine.start(stage);
      cbRef.current.onEvent?.({ type: "run-start", sessionId: cbRef.current.sessionId, startStage: stage });
    },
    [startStage],
  );

  useEffect(() => {
    if (autoStart) startRun();
  }, [autoStart, startRun]);

  useImperativeHandle(
    ref,
    (): SnapieControls => ({
      start: (s) => startRun(s ?? startStage),
      pause: () => engineRef.current?.pause(),
      resume: () => engineRef.current?.resume(),
      reset: () => engineRef.current?.reset(),
      getPhase: () => engineRef.current?.phase ?? "ready",
      getHud: () => engineRef.current?.hud() ?? null,
    }),
    [startRun, startStage],
  );

  // keyboard: aim + fire + start
  useEffect(() => {
    if (!keyboard) return;
    const held = new Set<string>();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const e = engineRef.current;
      if (!e || e.phase !== "playing") return;
      const sp = 4;
      let dx = 0;
      let dy = 0;
      if (held.has("ArrowLeft") || held.has("a")) dx -= sp;
      if (held.has("ArrowRight") || held.has("d")) dx += sp;
      if (held.has("ArrowUp") || held.has("w")) dy -= sp;
      if (held.has("ArrowDown") || held.has("s")) dy += sp;
      if (dx || dy) e.moveAim(dx, dy);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (ev: KeyboardEvent) => {
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "d", "w", "s"].includes(k)) {
        ev.preventDefault();
      }
      held.add(k);
      const e = engineRef.current;
      if (!e) return;
      if (k === " " || k === "Enter") {
        if (e.phase === "playing") e.fireAtAim();
        else startRun();
      }
      if (k === "p") {
        if (e.phase === "playing") e.pause();
        else if (e.phase === "paused") e.resume();
      }
    };
    const onUp = (ev: KeyboardEvent) => {
      held.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [keyboard, startRun]);

  const handlePointer = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((ev.clientY - rect.top) / rect.height) * VIEW_H;
    engine.showAim = false;
    if (engine.phase === "ready" || engine.phase === "over") {
      if (!showMenus) startRun();
      return;
    }
    engine.shoot(x, y);
  };

  const toggleMute = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sfx.muted = !engine.sfx.muted;
    setMuted(engine.sfx.muted);
  };

  const timePct = hud ? (hud.timeLeft / RULES.roundSeconds) * 100 : 100;
  const touch = showTouchControls === true;

  return (
    <div
      ref={rootRef}
      className={className}
      style={
        isFullscreen
          ? {
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100dvh",
              display: "flex",
              flexDirection: "column",
              fontFamily: MONO,
              color: PAL.light,
              userSelect: "none",
              background: PAL.bg,
            }
          : {
              width: "100%",
              maxWidth,
              margin: "0 auto",
              fontFamily: MONO,
              color: PAL.light,
              userSelect: "none",
            }
      }
    >
      {showMenus && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10,
            lineHeight: 1.6,
            padding: "8px 10px",
            background: PAL.panel,
            border: `2px solid ${PAL.dim}`,
            borderBottom: "none",
          }}
        >
          <span style={{ color: PAL.cyan }}>SCORE {String(hud?.score ?? 0).padStart(5, "0")}</span>
          <span style={{ color: PAL.orange }}>x{(hud?.multiplier ?? 1).toFixed(1)}</span>
          <span>
            STAGE {hud?.stage ?? 1} · {hud?.stageLabel ?? "HIVE PERIMETER"}
          </span>
          <span style={{ color: (hud?.misses ?? 0) >= RULES.maxMisses - 1 ? PAL.orange : PAL.green }}>
            LIVES {Math.max(0, RULES.maxMisses - (hud?.misses ?? 0))}
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            {fullscreenSupported && (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  color: PAL.cyan,
                  background: "transparent",
                  border: `1px solid ${PAL.cyan}`,
                  padding: "3px 6px",
                  cursor: "pointer",
                }}
              >
                {isFullscreen ? "⤡" : "⤢"}
              </button>
            )}
            <button
              type="button"
              onClick={toggleMute}
              style={{
                fontFamily: MONO,
                fontSize: 9,
                color: muted ? PAL.dim : PAL.cyan,
                background: "transparent",
                border: `1px solid ${muted ? PAL.dim : PAL.cyan}`,
                padding: "3px 6px",
                cursor: "pointer",
              }}
            >
              {muted ? "SFX OFF" : "SFX ON"}
            </button>
          </span>
        </div>
      )}

      <div
        style={{
          position: "relative",
          border: `2px solid ${PAL.cyan}`,
          boxShadow: `0 0 0 2px ${PAL.panel}, 0 0 24px rgba(115,239,247,0.25)`,
          background: PAL.bg,
          ...(isFullscreen
            ? { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }
            : null),
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointer}
          style={
            isFullscreen
              ? {
                  // Bounded by the container on both axes and letterboxed to fit —
                  // width:100% + aspect-ratio alone doesn't know about the container's
                  // height limit, which in landscape fullscreen cut the bottom of the
                  // game off the screen instead of shrinking to fit above it.
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  imageRendering: "pixelated",
                  cursor: "crosshair",
                  touchAction: "manipulation",
                }
              : {
                  display: "block",
                  width: "100%",
                  height: "auto",
                  aspectRatio: `${VIEW_W} / ${VIEW_H}`,
                  imageRendering: "pixelated",
                  cursor: "crosshair",
                  touchAction: "manipulation",
                }
          }
        />

        {isFullscreen && isPortrait && isTouch && (
          // A non-blocking nudge, not a takeover — some phones ignore the
          // landscape lock request (iOS never implements it) or the user has
          // rotation lock on, but the game is still fully playable in
          // portrait, so this shouldn't stop them from tapping through it.
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              zIndex: 3,
              pointerEvents: "none",
              textAlign: "center",
              padding: "6px 8px",
              fontSize: 8,
              lineHeight: 1.6,
              color: PAL.light,
              background: "rgba(18,19,31,0.85)",
            }}
          >
            ROTATE YOUR DEVICE FOR THE FULL EXPERIENCE
          </div>
        )}

        {showMenus && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 6,
              background: "rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                width: `${timePct}%`,
                height: "100%",
                background: timePct < 25 ? PAL.orange : PAL.green,
                transition: "width 120ms linear",
              }}
            />
          </div>
        )}

        {showMenus && phase === "ready" && (
          <Overlay>
            <h2 style={{ fontSize: 18, margin: 0, color: PAL.cyan, letterSpacing: 2 }}>SNAPIE BLAST</h2>
            <p style={{ fontSize: 9, color: PAL.light, margin: "10px 0 0", lineHeight: 1.8 }}>
              SHOOTING GALLERY · 60 SECONDS · 3 LIVES
            </p>
            <PulseButton onClick={() => startRun()}>CLICK TO PLAY</PulseButton>
            <p style={{ fontSize: 8, color: PAL.dim, margin: 0, lineHeight: 1.9 }}>
              CLICK / TAP TO FIRE · ARROWS + SPACE ALSO WORK
            </p>
          </Overlay>
        )}

        {showMenus && phase === "paused" && (
          <Overlay>
            <h2 style={{ fontSize: 14, margin: 0, color: PAL.orange }}>PAUSED</h2>
            <PulseButton onClick={() => engineRef.current?.resume()}>RESUME</PulseButton>
          </Overlay>
        )}

        {showMenus && phase === "over" && (
          <Overlay>
            <h2 style={{ fontSize: 14, margin: 0, color: result?.won ? PAL.green : PAL.orange }}>
              {result?.won ? "TIME UP — SURVIVED!" : "GAME OVER"}
            </h2>
            <p style={{ fontSize: 12, color: PAL.cyan, margin: "12px 0 0" }}>
              SCORE {String(result?.score ?? 0).padStart(5, "0")}
            </p>
            <p style={{ fontSize: 8, color: PAL.light, margin: "8px 0 0", lineHeight: 1.9 }}>
              STAGE {result?.stage ?? 1} · MULT x{(hud?.multiplier ?? 1).toFixed(1)} · HITS {hud?.hits ?? 0}
            </p>
            {resultSlot}
            <PulseButton onClick={() => startRun()}>RETRY</PulseButton>
          </Overlay>
        )}
      </div>

      {(touch || showTouchControls === "auto") && showMenus && (
        <p
          style={{
            flexShrink: 0,
            fontSize: 8,
            color: PAL.dim,
            textAlign: "center",
            margin: "10px 0 0",
            lineHeight: 1.9,
          }}
        >
          TAP THE ALIENS · EVERY MISSED SHOT COSTS A LIFE
        </p>
      )}
    </div>
  );
});

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // "safe center" falls back to start-alignment once content overflows,
        // so the Save Score / Retry buttons stay reachable via scroll instead
        // of spilling out past the frame's fixed-aspect-ratio bounds on short
        // mobile viewports.
        justifyContent: "safe center",
        gap: 14,
        textAlign: "center",
        padding: 16,
        background: "rgba(18,19,31,0.72)",
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

function PulseButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <>
      <style>{`@keyframes snapie-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.96)}}`}</style>
      <button
        type="button"
        onClick={onClick}
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: PAL.bg,
          background: PAL.cyan,
          border: "none",
          padding: "10px 16px",
          cursor: "pointer",
          animation: "snapie-pulse 1.1s ease-in-out infinite",
          boxShadow: `4px 4px 0 ${PAL.orange}`,
        }}
      >
        {children}
      </button>
    </>
  );
}
