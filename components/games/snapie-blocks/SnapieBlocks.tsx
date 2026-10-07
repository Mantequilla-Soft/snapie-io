'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFullscreen, usePortraitOrientation } from '@/hooks/useFullscreen';
import { useWakeLock } from '@/hooks/useWakeLock';
import { BLOCKS_BOARD_H, BLOCKS_BOARD_W, BLOCKS_HP_MAX } from '@/lib/games/blocks/constants';
import { createBlocksEngine, pieceCells, type BlocksEngine, type BlocksInput } from '@/lib/games/blocks/engine';
import { CYAN, GREEN, LIGHT, ORANGE, PANEL, PIECE_COLORS, SHELL, type Cell, type PieceId } from '@/lib/games/blocks/pieces';

const PIXEL = "'Press Start 2P', ui-monospace, monospace";
const CELL = 16;

export interface BlocksOpponent {
  name: string;
  hp: number;
  linesSent: number;
  alive: boolean;
}

export interface SnapieBlocksBoardProps {
  matchKey: string;
  running: boolean;
  opponent: BlocksOpponent | null;
  linesSent: number;
  incoming: { id: string; lines: number }[];
  overlay?: ReactNode;
  onClear: (lines: number, eventId: string) => void;
  onTopOut: () => void;
  onGarbageApplied: (ids: string[]) => void;
}

function blankInput(): BlocksInput {
  return { left: false, right: false, soft: false, hard: false, rotateCW: false, rotateCCW: false };
}

function Meter({ value, alive }: { value: number; alive: boolean }) {
  const pct = alive ? Math.max(0, Math.min(1, value / BLOCKS_HP_MAX)) : 0;
  const color = !alive ? '#b13e53' : pct > 0.5 ? GREEN : pct > 0.25 ? ORANGE : '#b13e53';
  return (
    <div style={{ flex: 1, height: 10, background: '#333c57', border: `1px solid ${SHELL}` }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color }} />
    </div>
  );
}

function drawBoard(ctx: CanvasRenderingContext2D, engine: BlocksEngine) {
  ctx.clearRect(0, 0, BLOCKS_BOARD_W * CELL, BLOCKS_BOARD_H * CELL);
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, 0, BLOCKS_BOARD_W * CELL, BLOCKS_BOARD_H * CELL);
  const paint = (x: number, y: number, cell: Cell, alpha = 1) => {
    if (y < 0 || y >= BLOCKS_BOARD_H || cell === 0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PIECE_COLORS[cell];
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 3);
    ctx.globalAlpha = 1;
  };
  for (let y = 0; y < BLOCKS_BOARD_H; y++) {
    for (let x = 0; x < BLOCKS_BOARD_W; x++) paint(x, y, engine.board[y]![x]!);
  }
  const active = engine.active;
  if (active && engine.alive) {
    const ghost = engine.ghostY();
    if (ghost != null && ghost !== active.y) {
      const ghostPiece = { ...active, y: ghost };
      for (const [x, y] of cellsOf(ghostPiece)) paint(x, y, active.id, 0.28);
    }
    for (const [x, y] of cellsOf(active)) paint(x, y, active.id);
  }
}

function cellsOf(active: { id: PieceId; rot: number; x: number; y: number }): [number, number][] {
  return pieceCells(active);
}

export function SnapieBlocksBoard({
  matchKey,
  running,
  opponent,
  linesSent,
  incoming,
  overlay,
  onClear,
  onTopOut,
  onGarbageApplied,
}: SnapieBlocksBoardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BlocksEngine | null>(null);
  const heldRef = useRef({ left: false, right: false, soft: false });
  const latchRef = useRef({ hard: false, cw: false, ccw: false });
  const cbRef = useRef({ onClear, onTopOut, onGarbageApplied });
  cbRef.current = { onClear, onTopOut, onGarbageApplied };
  const runningRef = useRef(running);
  runningRef.current = running;
  const pausedRef = useRef(false);
  const appliedRef = useRef(new Set<string>());
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState(0);
  const [touch, setTouch] = useState(false);
  const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const isPortrait = usePortraitOrientation();
  const [isTouch, setIsTouch] = useState(false);
  useWakeLock(running && !paused);

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    setTouch(coarse);
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const engine = createBlocksEngine();
    engineRef.current = engine;
    appliedRef.current = new Set();
    setPending(0);
    setPaused(false);
    let raf = 0;
    let last = performance.now();
    let pendingShown = 0;
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      const latch = latchRef.current;
      const held = heldRef.current;
      const input: BlocksInput = {
        left: held.left,
        right: held.right,
        soft: held.soft,
        hard: latch.hard,
        rotateCW: latch.cw,
        rotateCCW: latch.ccw,
      };
      latch.hard = false;
      latch.cw = false;
      latch.ccw = false;
      if (runningRef.current && !pausedRef.current) engine.tick(dt, input);
      drawBoard(ctx, engine);
      if (engine.pendingGarbage !== pendingShown) {
        pendingShown = engine.pendingGarbage;
        setPending(pendingShown);
      }
      for (const event of engine.drainEvents()) {
        if (event.type === 'clear') cbRef.current.onClear(event.lines, event.eventId);
        else if (event.type === 'top-out') cbRef.current.onTopOut();
        else if (event.type === 'garbage') cbRef.current.onGarbageApplied(event.ids);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engineRef.current = null;
    };
  }, [matchKey]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const row of incoming) {
      if (appliedRef.current.has(row.id)) continue;
      appliedRef.current.add(row.id);
      engine.addGarbage(row.id, row.lines);
    }
  }, [incoming]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'p' || key === 'P') {
        setPaused((value) => !value);
        return;
      }
      if (key === 'ArrowLeft' || key === 'a') heldRef.current.left = true;
      else if (key === 'ArrowRight' || key === 'd') heldRef.current.right = true;
      else if (key === 'ArrowDown' || key === 's') heldRef.current.soft = true;
      else if (key === 'ArrowUp' || key === 'w' || key === 'x') latchRef.current.cw = true;
      else if (key === 'z') latchRef.current.ccw = true;
      else if (key === ' ') latchRef.current.hard = true;
      else return;
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'ArrowLeft' || key === 'a') heldRef.current.left = false;
      else if (key === 'ArrowRight' || key === 'd') heldRef.current.right = false;
      else if (key === 'ArrowDown' || key === 's') heldRef.current.soft = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const hold = (side: 'left' | 'right' | 'soft', down: boolean) => {
    heldRef.current[side] = down;
  };

  const hp = opponent?.hp ?? BLOCKS_HP_MAX;
  const alive = opponent?.alive ?? true;

  return (
    <div
      ref={rootRef}
      style={
        isFullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              background: SHELL,
              color: LIGHT,
              fontFamily: PIXEL,
              userSelect: 'none',
              touchAction: 'manipulation',
            }
          : {
              width: '100%',
              maxWidth: 440,
              margin: '0 auto',
              color: LIGHT,
              fontFamily: PIXEL,
              userSelect: 'none',
              touchAction: 'manipulation',
            }
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 10px',
          background: SHELL,
          border: `2px solid ${CYAN}`,
          borderBottom: 'none',
          fontSize: 8,
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: ORANGE }}>{opponent?.name ?? 'OPPONENT'}</span>
          <span>{alive ? 'HP' : 'OUT'}</span>
          {fullscreenSupported && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              style={iconButton}
            >
              {isFullscreen ? '⤡' : '⤢'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Meter value={hp} alive={alive} />
          <span style={{ minWidth: 28, textAlign: 'right' }}>{alive ? hp : 0}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: CYAN }}>
          <span>LINES SENT</span>
          <span>{String(linesSent).padStart(3, '0')}</span>
        </div>
      </div>

      <div style={{ position: 'relative', border: `2px solid ${CYAN}`, background: PANEL, lineHeight: 0 }}>
        <canvas
          ref={canvasRef}
          width={BLOCKS_BOARD_W * CELL}
          height={BLOCKS_BOARD_H * CELL}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            imageRendering: 'pixelated',
            aspectRatio: `${BLOCKS_BOARD_W} / ${BLOCKS_BOARD_H}`,
            background: PANEL,
          }}
        />
        {pending > 0 && running && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              fontSize: 8,
              color: ORANGE,
              background: 'rgba(18,19,31,0.85)',
              padding: '4px 6px',
            }}
          >
            GARBAGE +{pending}
          </div>
        )}
        {paused && running && (
          <div style={overlayStyle}>
            <div style={{ color: CYAN, fontSize: 14 }}>PAUSED</div>
            <div style={{ fontSize: 8, lineHeight: 2 }}>P TO RESUME</div>
          </div>
        )}
        {isFullscreen && isPortrait && isTouch && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              zIndex: 3,
              pointerEvents: 'none',
              textAlign: 'center',
              padding: '6px 8px',
              fontSize: 8,
              lineHeight: 1.6,
              color: LIGHT,
              background: 'rgba(18,19,31,0.85)',
            }}
          >
            ROTATE YOUR DEVICE FOR THE FULL EXPERIENCE
          </div>
        )}
        {overlay && <div style={overlayStyle}>{overlay}</div>}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          border: `2px solid ${CYAN}`,
          borderTop: 'none',
          fontSize: 7,
          lineHeight: 1.7,
          color: '#94b0c2',
        }}
      >
        <span>ARROWS MOVE</span>
        <span>X / Z ROTATE</span>
        <span>SPACE DROP</span>
      </div>

      {touch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <TouchButton label="◀" aria="Move left" onDown={() => hold('left', true)} onUp={() => hold('left', false)} />
            <TouchButton label="ROT" aria="Rotate" onDown={() => { latchRef.current.cw = true; }} onUp={() => undefined} />
            <TouchButton label="▶" aria="Move right" onDown={() => hold('right', true)} onUp={() => hold('right', false)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <TouchButton label="▼" aria="Soft drop" onDown={() => hold('soft', true)} onUp={() => hold('soft', false)} />
            <TouchButton label="DROP" aria="Hard drop" onDown={() => { latchRef.current.hard = true; }} onUp={() => undefined} accent />
            <TouchButton
              label={paused ? 'GO' : 'II'}
              aria={paused ? 'Resume' : 'Pause'}
              onDown={() => setPaused((value) => !value)}
              onUp={() => undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const iconButton: React.CSSProperties = {
  fontFamily: PIXEL,
  fontSize: 9,
  color: CYAN,
  background: 'transparent',
  border: `1px solid ${CYAN}`,
  padding: '3px 6px',
  cursor: 'pointer',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: 16,
  textAlign: 'center',
  background: 'rgba(26,28,44,0.9)',
  lineHeight: 1.6,
};

function TouchButton({
  label,
  aria,
  onDown,
  onUp,
  accent,
}: {
  label: string;
  aria: string;
  onDown: () => void;
  onUp: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onPointerDown={(e) => {
        e.preventDefault();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      style={{
        flex: 1,
        height: 56,
        fontFamily: PIXEL,
        fontSize: label.length > 2 ? 8 : 14,
        background: SHELL,
        color: accent ? ORANGE : CYAN,
        border: `2px solid ${accent ? ORANGE : CYAN}`,
        touchAction: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
