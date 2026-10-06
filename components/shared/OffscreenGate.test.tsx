// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { createElement } from 'react';
import OffscreenGate from './OffscreenGate';

type Callback = (entries: Array<{ isIntersecting: boolean; boundingClientRect: { height: number } }>) => void;

class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: Callback;
  constructor(callback: Callback) {
    this.callback = callback;
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
  vi.unstubAllGlobals();
});

function renderGate(keepMounted = false) {
  return render(createElement(
    OffscreenGate,
    {
      rootMargin: '100px 0px 100px 0px',
      unmountedMinHeight: 400,
      keepMounted,
    },
    createElement('p', null, 'card body'),
  ));
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
    const { queryByText } = renderGate();
    act(() => {
      FakeObserver.instances[0].trigger(true, 220);
    });
    expect(queryByText('card body')).not.toBeNull();
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
});
