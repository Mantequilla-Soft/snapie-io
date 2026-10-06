// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { DeferredMediaGate } from './DeferredFeedMedia';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function gate() {
  return createElement(
    DeferredMediaGate,
    { defer: true, aspectRatio: 4 / 3 },
    createElement('img', { alt: 'gif', src: 'https://example.com/a.gif' }),
  );
}

describe('DeferredMediaGate', () => {
  it('keeps viewport media on click-to-play', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 300,
      height: 290,
      left: 0,
      right: 400,
      width: 400,
      x: 0,
      y: 10,
      toJSON() { return {}; },
    });
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      observe = observe;
      disconnect() {}
    });
    const { container } = render(gate());
    expect(container.querySelector('img')).toBeNull();
    expect(observe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play media' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.gif');
  });

  it('loads below-fold media only once it nears the viewport', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 2000,
      bottom: 2400,
      height: 400,
      left: 0,
      right: 400,
      width: 400,
      x: 0,
      y: 2000,
      toJSON() { return {}; },
    });
    const obs: { callback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null } = { callback: null };
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        obs.callback = cb;
      }
      observe() {}
      disconnect() {}
    });
    const { container } = render(gate());
    expect(container.querySelector('img')).toBeNull();
    const callback = obs.callback;
    if (!callback) throw new Error('observer was not created');
    callback([{ isIntersecting: false }]);
    expect(container.querySelector('img')).toBeNull();
    callback([{ isIntersecting: true }]);
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.gif');
    });
  });
});
