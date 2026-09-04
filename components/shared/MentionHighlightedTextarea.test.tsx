// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { createElement, createRef } from 'react';
import MentionHighlightedTextarea from './MentionHighlightedTextarea';

// Every mention in these tests reads as a confirmed-real account, and nothing
// reaches the network.
vi.mock('@/hooks/useMentionValidation', () => ({
  useMentionValidation: (text: string) =>
    new Map((text.match(/@([a-z0-9.-]+)/gi) ?? []).map(m => [m.slice(1).toLowerCase(), true])),
}));
vi.mock('@/lib/hive/usernameLookup', () => ({
  searchUsernamesByPrefix: async () => [],
  validateUsernames: async () => new Set<string>(),
  getKnownValidity: () => null,
}));

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

// Reproduced live in a real browser (Chrome, blog composer at 459px): the
// moment typed content overflows, the real textarea grows a classic scrollbar
// and Chrome takes its ~15px out of that element's CONTENT box — 459 -> 444 —
// while the backdrop, which has no scrollbar, stays at 459. Two different
// widths means two different sets of line breaks for the same text, so the
// caret (drawn by the real textarea) and the letters (drawn by the backdrop)
// drift apart by however far the wrap points have diverged: measured at up to
// 65px (~8 characters) horizontally, on 137 of 200 sample paragraphs. That is
// the "cursor runs ahead of what I'm typing, but the letters still land in the
// right place" report, and why it strikes partway into a post rather than from
// the first line — that's the scrollbar arriving.
describe('MentionHighlightedTextarea backdrop width sync', () => {
  it("pins the backdrop to the textarea's content width, so a scrollbar can't change where lines wrap", () => {
    const ref = createRef<HTMLTextAreaElement>();
    const { container } = render(createElement(MentionHighlightedTextarea, { ref }));
    const textarea = ref.current!;
    const backdrop = getBackdrop(container);

    // jsdom has no layout, so stand in for "the scrollbar just appeared and
    // took 15px out of the textarea's content box".
    Object.defineProperty(textarea, 'clientWidth', { value: 444, configurable: true });

    act(() => {
      textarea.value = 'text long enough to have overflowed and produced a scrollbar';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Border-box widths: the backdrop mirrors the textarea's border and
    // padding, so matching content boxes means matching clientWidth + borders
    // (Chakra's textarea carries a 1px border on each side).
    const style = window.getComputedStyle(textarea);
    const borders =
      (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    expect(backdrop.style.width).toBe(`${444 + borders}px`);
    expect(borders).toBeGreaterThan(0); // guards the line above from passing vacuously

  });

  it('leaves the backdrop alone while the editor has no layout at all (preview-only mode)', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const { container } = render(createElement(MentionHighlightedTextarea, { ref }));
    const textarea = ref.current!;
    const backdrop = getBackdrop(container);
    backdrop.style.width = '444px';

    // clientWidth is 0 for a hidden element; pinning the backdrop to 0 would
    // wrap every line to one character until something resized it back.
    Object.defineProperty(textarea, 'clientWidth', { value: 0, configurable: true });

    act(() => {
      textarea.value = 'still typing while hidden';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(backdrop.style.width).toBe('444px');
  });
});


// The backdrop is the only layer whose text is visible, but the CARET is
// positioned by the real textarea underneath, which renders the same
// characters in one plain weight. So the backdrop may only ever paint a
// mention — never re-measure it. A 600 weight (what this used to do) measured
// ~11px wider than 400 for a 15-character handle in the composer's mono font,
// which shoves every glyph after the mention on that line out of step with
// the caret.
describe('MentionHighlightedTextarea mention styling', () => {
  it('marks a confirmed mention without changing its text metrics', () => {
    const { container } = render(
      createElement(MentionHighlightedTextarea, { defaultValue: 'hello @alice there' })
    );
    const spans = Array.from(getBackdrop(container).querySelectorAll('span'));
    const mention = spans.find(el => el.textContent === '@alice')!;
    const plain = spans.find(el => el.textContent === 'hello ')!;

    expect(mention).toBeTruthy();
    expect(plain).toBeTruthy();

    const metric = (el: Element) => {
      const style = window.getComputedStyle(el);
      return {
        fontWeight: style.fontWeight,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        letterSpacing: style.letterSpacing,
      };
    };
    expect(metric(mention)).toEqual(metric(plain));
    // ...while still being visually distinguishable.
    expect(mention.className).not.toBe(plain.className);
  });
});
