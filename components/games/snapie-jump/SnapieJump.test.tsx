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
const captured = {
  options: null as CapturedOptions | null,
  phase: 'idle',
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  setKeys: vi.fn(),
};

vi.mock('./game/engine', () => ({
  createEngine: (_canvas: HTMLCanvasElement, options: CapturedOptions) => {
    captured.options = options;
    return {
      start: captured.start,
      pause: captured.pause,
      resume: captured.resume,
      reset: vi.fn(),
      destroy: vi.fn(),
      resize: vi.fn(),
      setMuted: vi.fn(),
      setKeys: captured.setKeys,
      setPointerTarget: vi.fn(),
      getPhase: () => captured.phase,
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
  captured.phase = 'idle';
  captured.start.mockClear();
  captured.pause.mockClear();
  captured.resume.mockClear();
  captured.setKeys.mockClear();
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

  // Regression: the handler lives on window, so it used to swallow a/d/p and the
  // arrow keys from every text field on the page while the game was mounted.
  describe('keyboard and text fields', () => {
    function mountWithField(tag: 'input' | 'textarea') {
      render(createElement(SnapieJump, { sessionId: 's1' }));
      const field = document.createElement(tag);
      document.body.appendChild(field);
      field.focus();
      return field;
    }

    it.each(['input', 'textarea'] as const)('leaves a, d, p and arrows alone inside a %s', (tag) => {
      captured.phase = 'running';
      const field = mountWithField(tag);
      for (const key of ['a', 'd', 'A', 'D', 'p', 'ArrowLeft', 'ArrowRight']) {
        // fireEvent returns false when the default action was prevented.
        expect(fireEvent.keyDown(field, { key }), `${key} in ${tag}`).toBe(true);
      }
      expect(captured.setKeys).not.toHaveBeenCalled();
      expect(captured.pause).not.toHaveBeenCalled();
      field.remove();
    });

    it('leaves keys alone inside a contenteditable composer', () => {
      captured.phase = 'running';
      render(createElement(SnapieJump, { sessionId: 's1' }));
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      document.body.appendChild(editor);
      expect(fireEvent.keyDown(editor, { key: 'a' })).toBe(true);
      expect(captured.setKeys).not.toHaveBeenCalled();
      editor.remove();
    });

    it('still steers and prevents scrolling when nothing is focused', () => {
      captured.phase = 'running';
      render(createElement(SnapieJump, { sessionId: 's1' }));
      expect(fireEvent.keyDown(document.body, { key: 'ArrowLeft' })).toBe(false);
      expect(captured.setKeys).toHaveBeenCalledWith(true, false);
    });
  });

  describe('pause keys', () => {
    it('P toggles pause', () => {
      render(createElement(SnapieJump, { sessionId: 's1' }));
      captured.phase = 'running';
      fireEvent.keyDown(document.body, { key: 'p' });
      expect(captured.pause).toHaveBeenCalledTimes(1);
      captured.phase = 'paused';
      fireEvent.keyDown(document.body, { key: 'P' });
      expect(captured.resume).toHaveBeenCalledTimes(1);
    });

    it('Escape pauses a running game but never resumes a paused one', () => {
      render(createElement(SnapieJump, { sessionId: 's1' }));
      captured.phase = 'running';
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(captured.pause).toHaveBeenCalledTimes(1);
      captured.phase = 'paused';
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(captured.resume).not.toHaveBeenCalled();
    });
  });
});
