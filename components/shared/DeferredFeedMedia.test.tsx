// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import { DeferredMediaGate } from './DeferredFeedMedia';

afterEach(() => {
  cleanup();
  document.querySelectorAll('img[fetchpriority="high"]').forEach((node) => node.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function gate() {
  return (
    <DeferredMediaGate defer aspectRatio={4 / 3}>
      {createElement('img', { alt: 'gif', src: 'https://example.com/a.gif' })}
    </DeferredMediaGate>
  );
}

describe('DeferredMediaGate', () => {
  it('reserves a poster box and does not mount media until click', () => {
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
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('[autoplay]')).toBeNull();
    expect(observe).not.toHaveBeenCalled();
    const poster = screen.getByRole('button', { name: 'Play media' }) as HTMLElement;
    expect(poster.style.aspectRatio).toBe(String(4 / 3));
    expect(poster.style.width).toBe('100%');
    fireEvent.click(poster);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.gif');
    expect(container.querySelector('img')?.getAttribute('autoplay')).toBeNull();
  });

  it('does not load a below-fold slot until the priority image has loaded', async () => {
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
    const priority = document.createElement('img');
    priority.setAttribute('fetchpriority', 'high');
    Object.defineProperty(priority, 'complete', { configurable: true, get: () => false });
    document.body.appendChild(priority);
    const obs: { callback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null } = { callback: null };
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        obs.callback = cb;
      }
      observe() {}
      disconnect() {}
    });
    const { container } = render(gate());
    const callback = obs.callback;
    if (!callback) throw new Error('observer was not created');
    callback([{ isIntersecting: true }]);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('img')).toBeNull();
    priority.dispatchEvent(new Event('load'));
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.gif');
    });
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
