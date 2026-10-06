// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import OffscreenGate from './OffscreenGate';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: ObserverCallback;
  init?: { rootMargin?: string };
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(callback: ObserverCallback, init?: { rootMargin?: string }) {
    this.callback = callback;
    this.init = init;
    FakeObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

afterEach(() => {
  cleanup();
  FakeObserver.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OffscreenGate', () => {
  it('stays unmounted when IntersectionObserver is unavailable', () => {
    const { queryByText } = render(
      <OffscreenGate rootMargin="100px 0px 100px 0px">
        <p>card body</p>
      </OffscreenGate>,
    );
    expect(queryByText('card body')).toBeNull();
  });

  it('mounts when the card approaches and holds the last height when it leaves', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { queryByText, container, unmount, rerender } = render(
      <OffscreenGate rootMargin="3000px 0px 3000px 0px">
        <p>card body</p>
      </OffscreenGate>,
    );
    const gate = container.firstElementChild as HTMLElement;
    const observer = FakeObserver.instances[0];
    expect(queryByText('card body')).toBeNull();
    expect(observer.init?.rootMargin).toBe('3000px 0px 3000px 0px');
    expect(observer.observe).toHaveBeenCalledWith(gate);

    act(() => {
      observer.trigger(true);
    });
    expect(queryByText('card body')).not.toBeNull();

    vi.spyOn(gate, 'getBoundingClientRect').mockReturnValue({
      height: 240,
      width: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });
    act(() => {
      observer.trigger(false);
    });
    expect(queryByText('card body')).toBeNull();

    rerender(
      <OffscreenGate rootMargin="100px 0px 100px 0px">
        <p>card body</p>
      </OffscreenGate>,
    );
    expect(observer.disconnect).toHaveBeenCalled();

    unmount();
  });
});
