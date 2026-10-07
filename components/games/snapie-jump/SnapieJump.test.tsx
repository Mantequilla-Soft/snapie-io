// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';
import type { SnapieJumpResult } from './types';

// The engine draws on a real canvas, which jsdom does not have. Capture the
// options the wrapper hands it and stand in a minimal engine, so these tests
// cover the wrapper's own behavior (session handoff, results, keyboard).
type CapturedOptions = {
  playerName?: string;
  sessionId?: string;
  onEvent?: (e: { type: string; [k: string]: unknown }) => void;
  onResult?: (r: SnapieJumpResult) => void;
};
const captured: { options: CapturedOptions | null; start: ReturnType<typeof vi.fn> } = {
  options: null,
  start: vi.fn(),
};

vi.mock('./game/engine', () => ({
  createEngine: (_canvas: HTMLCanvasElement, options: CapturedOptions) => {
    captured.options = options;
    return {
      start: captured.start,
      pause: vi.fn(),
      resume: vi.fn(),
      reset: vi.fn(),
      destroy: vi.fn(),
      resize: vi.fn(),
      setMuted: vi.fn(),
      setKeys: vi.fn(),
      setPointerTarget: vi.fn(),
      getPhase: () => 'idle',
      getPlayerX: () => 0,
      getScale: () => 1,
      getHud: () => ({
        height: 0, score: 0, honey: 0, best: 0, phase: 'idle', superJump: 0, magnet: 0, shield: false,
      }),
    };
  },
}));

vi.mock('@/hooks/useFullscreen', () => ({
  useFullscreen: () => ({ isFullscreen: false, supported: false, toggle: vi.fn() }),
  usePortraitOrientation: () => false,
}));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: () => undefined }));

import { SnapieJump } from './SnapieJump';

beforeEach(() => {
  captured.options = null;
  captured.start.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  window.matchMedia = window.matchMedia || ((() => ({ matches: false })) as unknown as typeof window.matchMedia);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function result(overrides: Partial<SnapieJumpResult> = {}): SnapieJumpResult {
  return {
    gameId: 'snapie-jump',
    gameVersion: '1.0.0',
    score: 1200,
    stage: 1,
    stagesCleared: 0,
    won: false,
    durationMs: 20000,
    endedAt: 1,
    meta: { height: 120, honey: 4, isNewBest: false },
    ...overrides,
  };
}

describe('SnapieJump wrapper', () => {
  it('shows the title screen and starts a run from PLAY', () => {
    render(createElement(SnapieJump, { sessionId: 's1', playerName: 'alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'PLAY' }));
    expect(captured.start).toHaveBeenCalledTimes(1);
  });

  // Regression: the engine is created once, but the host issues a new sessionId
  // after every run and scores are deduped per sessionId. If the engine kept the
  // first value, every run after the first would be saved as a duplicate (0 pts).
  it('hands the engine the current sessionId and playerName, not the first ones', () => {
    const { rerender } = render(createElement(SnapieJump, { sessionId: 'run-1', playerName: 'alice' }));
    expect(captured.options?.sessionId).toBe('run-1');

    rerender(createElement(SnapieJump, { sessionId: 'run-2', playerName: 'bob' }));
    expect(captured.options?.sessionId).toBe('run-2');
    expect(captured.options?.playerName).toBe('bob');
  });

  it('forwards the result to onResult and shows the host result slot on game over', () => {
    const onResult = vi.fn();
    render(
      createElement(SnapieJump, {
        sessionId: 's1',
        onResult,
        resultSlot: createElement('button', { type: 'button' }, 'Save Score'),
      }),
    );
    const r = result();
    act(() => {
      captured.options?.onResult?.(r);
      // What the engine emits when the run ends: a final hud, then game-over.
      captured.options?.onEvent?.({
        type: 'hud',
        hud: { height: 120, score: 1200, honey: 4, best: 1200, phase: 'game-over', superJump: 0, magnet: 0, shield: false },
      });
      captured.options?.onEvent?.({ type: 'game-over', result: r });
    });
    expect(onResult).toHaveBeenCalledWith(r);
    expect(screen.getByText('GAME OVER')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Score' })).toBeTruthy();
  });

  it('does not restart the game when Enter is pressed on a focused button', () => {
    render(createElement(SnapieJump, { sessionId: 's1' }));
    const button = screen.getByRole('button', { name: 'PLAY' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    // The wrapper must leave Enter to the focused button itself (its own click
    // handler), not also start a run from the window listener.
    expect(captured.start).not.toHaveBeenCalled();
  });

  it('starts from Space when nothing interactive is focused', () => {
    render(createElement(SnapieJump, { sessionId: 's1' }));
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(captured.start).toHaveBeenCalledTimes(1);
  });
});
