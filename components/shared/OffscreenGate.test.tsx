// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import OffscreenGate from './OffscreenGate';

type Callback = (entries: Array<{ isIntersecting: boolean; boundingClientRect: { height: number } }>) => void;
type ObserverInit = { root?: Element | null; rootMargin?: string };

class FakeObserver {
  static instances: FakeObserver[] = [];
  static lastInit: ObserverInit | undefined;
  callback: Callback;
  constructor(callback: Callback, init?: ObserverInit) {
    this.callback = callback;
    FakeObserver.lastInit = init;
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  trigger(isIntersecting: boolean, height = 180) {
    this.callback([{ isIntersecting, boundingClientRect: { height } }]);
  }
}

afterEach(() => {
  cleanup();
  FakeObserver.instances = [];
  FakeObserver.lastInit = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderGate(keepMounted = false) {
  return render(
    <OffscreenGate
      rootMargin="100px 0px 100px 0px"
      unmountedMinHeight={400}
      keepMounted={keepMounted}
    >
      <p>card body</p>
    </OffscreenGate>,
  );
}

describe('OffscreenGate', () => {
  it('reserves the placeholder height until the scrollport approaches', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { queryByText, container } = renderGate();
    expect(queryByText('card body')).toBeNull();
    const gate = container.firstElementChild as HTMLElement;
    expect(gate.style.minHeight).toBe('400px');
  });

  it('mounts when the clip scroller says the card is near', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { queryByText, container } = renderGate();
    act(() => {
      FakeObserver.instances[0].trigger(true, 220);
    });
    expect(queryByText('card body')).not.toBeNull();
    const gate = container.firstElementChild as HTMLElement;
    expect(gate.style.minHeight).toBe('');
  });

  it('keeps a media slot from collapsing once it has been measured', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { container } = render(
      <OffscreenGate rootMargin="100px 0px 100px 0px" unmountedAspectRatio={16 / 9} preserveHeight>
        <p>player</p>
      </OffscreenGate>,
    );
    act(() => {
      FakeObserver.instances[0].trigger(true, 173);
    });
    const gate = container.firstElementChild as HTMLElement;
    expect(gate.style.minHeight).toBe('173px');
  });

  it('keeps a card mounted once it has been shown', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { queryByText } = renderGate(true);
    act(() => {
      FakeObserver.instances[0].trigger(true, 220);
    });
    act(() => {
      FakeObserver.instances[0].trigger(false, 220);
    });
    expect(queryByText('card body')).not.toBeNull();
  });

  it('unmounts a far card back to the measured height', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { queryByText, container } = renderGate(false);
    act(() => {
      FakeObserver.instances[0].trigger(true, 220);
    });
    act(() => {
      FakeObserver.instances[0].trigger(false, 220);
    });
    expect(queryByText('card body')).toBeNull();
    const gate = container.firstElementChild as HTMLElement;
    expect(gate.style.minHeight).toBe('220px');
  });

  it('reserves an aspect ratio before the slot is measured and does not use content-visibility', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { queryByText, container } = render(
      <OffscreenGate rootMargin="100px 0px 100px 0px" unmountedAspectRatio={16 / 9}>
        <p>player</p>
      </OffscreenGate>,
    );
    expect(queryByText('player')).toBeNull();
    const gate = container.firstElementChild as HTMLElement;
    expect(gate.style.aspectRatio).toBe(String(16 / 9));
    expect(gate.style.minHeight).toBe('');
    expect(gate.style.contentVisibility).toBe('');
    expect(gate.getAttribute('style') ?? '').not.toContain('content-visibility');
  });

  it('keeps a server-painted card mounted when the clip says it is offscreen', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const { queryByText } = render(
      <OffscreenGate rootMargin="100px 0px 100px 0px" initiallyMounted>
        <p>painted card</p>
      </OffscreenGate>,
    );
    act(() => {
      FakeObserver.instances[0].trigger(false, 220);
    });
    expect(queryByText('painted card')).not.toBeNull();
  });

  it('observes the clipping scroll parent instead of the viewport', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const scroller = document.createElement('div');
    scroller.dataset.overflow = 'auto';
    Object.defineProperty(scroller, 'clientHeight', { value: 800 });
    Object.defineProperty(scroller, 'scrollHeight', { value: 4000 });
    document.body.appendChild(scroller);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node) => {
      const overflowY = (node as HTMLElement).dataset?.overflow ?? 'visible';
      return { overflowY } as CSSStyleDeclaration;
    });

    render(
      <OffscreenGate rootMargin="8000px 0px 8000px 0px">
        <p>card body</p>
      </OffscreenGate>,
      { container: scroller },
    );

    expect(FakeObserver.lastInit?.root).toBe(scroller);
    expect(FakeObserver.lastInit?.rootMargin).toBe('8000px 0px 8000px 0px');
    expect(FakeObserver.lastInit?.root).not.toBeNull();
  });
});
