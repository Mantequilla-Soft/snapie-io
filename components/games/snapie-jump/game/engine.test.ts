// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEngine } from './engine';
import type { SnapieJumpResult } from '../types';

// Drives the real engine headlessly: a no-op canvas context, a manual
// requestAnimationFrame clock, a seeded Math.random and a random-walk steering
// "bot". The bot is not good at the game, so a run ends after a while.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Any property read gives back another callable no-op, so every canvas call works.
function noopContext(): CanvasRenderingContext2D {
  const noop: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => 0 : noop),
    apply: () => noop,
    set: () => true,
  });
  return noop as CanvasRenderingContext2D;
}

let frameCallback: FrameRequestCallback | null = null;
let clockMs = 0;

beforeEach(() => {
  frameCallback = null;
  clockMs = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frameCallback = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frameCallback = null;
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  const random = mulberry32(42);
  vi.spyOn(Math, 'random').mockImplementation(random);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = noopContext();
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

/** Advance one 60 fps frame. */
function step() {
  clockMs += 1000 / 60;
  const cb = frameCallback;
  frameCallback = null;
  cb?.(clockMs);
}

describe('snapie-jump engine (headless)', () => {
  it('ends a run with a result the score API accepts, using the current sessionId', () => {
    const live = { sessionId: 'run-1', playerName: 'alice' };
    const results: SnapieJumpResult[] = [];
    const engine = createEngine(makeCanvas(), {
      get sessionId() {
        return live.sessionId;
      },
      get playerName() {
        return live.playerName;
      },
      onResult: (r) => results.push(r),
    });
    engine.resize(400, 700);
    engine.start();

    // The host swaps in a new sessionId mid-run, as it does after a previous result.
    live.sessionId = 'run-2';

    const steer = mulberry32(7);
    let left = false;
    let right = false;
    for (let frame = 0; frame < 120_000 && results.length === 0; frame += 1) {
      if (frame % 25 === 0) {
        const r = steer();
        left = r < 0.4;
        right = r > 0.6;
        engine.setKeys(left, right);
      }
      step();
    }

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.gameId).toBe('snapie-jump');
    expect(result.sessionId).toBe('run-2');
    expect(result.playerName).toBe('alice');

    // Exactly what lib/games/scoreService.ts validates.
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.stage)).toBe(true);
    expect(result.stage).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result.stagesCleared)).toBe(true);
    expect(result.stagesCleared).toBeGreaterThanOrEqual(0);
    expect(typeof result.won).toBe('boolean');
    expect(Number.isFinite(result.durationMs)).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100_000);

    engine.destroy();
  });

  // The score API rejects stage < 1, and the upstream game used floor(height / 100),
  // which is 0 for any run under 100 m. Stage is 1-based here.
  it('reports a 1-based stage (floor(height / 100) + 1) across different runs', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      vi.mocked(Math.random).mockImplementation(mulberry32(seed));
      const results: SnapieJumpResult[] = [];
      const engine = createEngine(makeCanvas(), { onResult: (r) => results.push(r) });
      engine.resize(400, 700);
      engine.start();
      const steer = mulberry32(seed * 101);
      for (let frame = 0; frame < 120_000 && results.length === 0; frame += 1) {
        if (frame % 25 === 0) {
          const r = steer();
          engine.setKeys(r < 0.4, r > 0.6);
        }
        step();
      }
      engine.destroy();

      expect(results, `seed ${seed} should end its run`).toHaveLength(1);
      const result = results[0]!;
      expect(result.stage).toBe(Math.floor(result.meta.height / 100) + 1);
      expect(result.stage).toBeGreaterThanOrEqual(1);
    }
  });
});
