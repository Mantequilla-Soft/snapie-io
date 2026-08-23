// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { createElement, createRef } from 'react';
import MentionHighlightedTextarea from './MentionHighlightedTextarea';

// Reproduced live in a real browser: once typed content overflows the
// composer's fixed-height wrapper, the browser scrolls the real (invisible)
// textarea to keep the caret in view — but that auto-scroll doesn't reliably
// fire a `scroll` event, which is the *only* thing that used to sync the
// backdrop div (the layer that actually renders visible text). Result: the
// backdrop silently stops following the real textarea's scroll position, so
// every further keystroke visually lands somewhere other than where it was
// actually typed. These tests simulate that exact "scrollTop changed, no
// scroll event fired" case directly, since jsdom has no real layout engine
// to trigger genuine overflow/auto-scroll.
//
// No literal JSX here (createElement instead) — this repo's vitest setup
// has no @vitejs/plugin-react configured, so .test.tsx files are transformed
// as plain TS, not JSX.

function getBackdrop(container: HTMLElement): HTMLElement {
  return container.querySelector('[aria-hidden="true"]') as HTMLElement;
}

describe('MentionHighlightedTextarea backdrop scroll sync', () => {
  it('re-syncs the backdrop to the real textarea scroll position on every text change, without a scroll event', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const { container } = render(createElement(MentionHighlightedTextarea, { ref }));
    const textarea = ref.current!;
    const backdrop = getBackdrop(container);

    // Simulate the browser having auto-scrolled the real textarea while
    // typing, with no `scroll` event ever dispatched — exactly what was
    // observed live.
    textarea.scrollTop = 50;
    expect(backdrop.scrollTop).not.toBe(50); // not synced yet, by construction

    act(() => {
      textarea.value = 'some text that would have overflowed the wrapper';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(backdrop.scrollTop).toBe(50);
  });

  it('still syncs via the textarea scroll event too (user-driven scrollbar drag)', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const { container } = render(createElement(MentionHighlightedTextarea, { ref, defaultValue: 'line one\nline two\nline three' }));
    const textarea = ref.current!;
    const backdrop = getBackdrop(container);

    act(() => {
      textarea.scrollTop = 30;
      textarea.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    expect(backdrop.scrollTop).toBe(30);
  });
});
