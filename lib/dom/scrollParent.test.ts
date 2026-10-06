// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { findClipScroller } from './scrollParent';

function el(overflowY: string, clientHeight: number, scrollHeight: number): HTMLElement {
  const node = document.createElement('div');
  Object.defineProperty(node, 'clientHeight', { value: clientHeight });
  Object.defineProperty(node, 'scrollHeight', { value: scrollHeight });
  node.dataset.overflow = overflowY;
  return node;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('findClipScroller', () => {
  it('picks the viewport-sized ancestor that actually clips', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const outer = el('auto', 800, 4000);
    const grown = el('auto', 4000, 4000);
    const start = document.createElement('div');
    outer.appendChild(grown);
    grown.appendChild(start);
    document.body.appendChild(outer);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((node) => {
      const overflowY = (node as HTMLElement).dataset?.overflow ?? 'visible';
      return { overflowY } as CSSStyleDeclaration;
    });

    expect(findClipScroller(start)).toBe(outer);
  });

  it('picks a bounded scroller before content has overflowed', () => {
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    const scroller = el('auto', 900, 900);
    const start = document.createElement('span');
    scroller.appendChild(start);
    document.body.appendChild(scroller);

    vi.spyOn(window, 'getComputedStyle').mockImplementation((node) => {
      const overflowY = (node as HTMLElement).dataset?.overflow ?? 'visible';
      return { overflowY } as CSSStyleDeclaration;
    });

    expect(findClipScroller(start)).toBe(scroller);
  });
});
