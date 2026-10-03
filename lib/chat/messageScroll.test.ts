import { describe, expect, it } from 'vitest';
import {
  CHAT_LIST_INDEX_ORIGIN,
  absoluteMessageIndex,
  nextFirstItemIndex,
  pinAfterAtBottom,
  pinForNewConversation,
  shouldBackfillShortThread,
  shouldPageOlderHistory,
} from './messageScroll';

const row = (id: string) => ({ _id: id });

describe('chat scroll pin when the conversation changes', () => {
  it('starts pinned to the newest message and does not treat the mount as history', () => {
    const pin = pinForNewConversation();
    expect(pin).toEqual({ stickToLatest: true, settledAtLatest: false });
    // Virtuoso reports atBottom=false while it is still laid out at the top.
    // That must not cancel the pin or arm an older-page fetch.
    const stillPinning = pinAfterAtBottom(pin, false);
    expect(stillPinning).toEqual(pin);
    expect(shouldPageOlderHistory(stillPinning)).toBe(false);
  });

  it('arms history only after the user leaves a bottom that has settled', () => {
    const settled = pinAfterAtBottom(pinForNewConversation(), true);
    expect(settled).toEqual({ stickToLatest: true, settledAtLatest: true });
    expect(shouldPageOlderHistory(settled)).toBe(false);

    const reading = pinAfterAtBottom(settled, false);
    expect(reading).toEqual({ stickToLatest: false, settledAtLatest: true });
    expect(shouldPageOlderHistory(reading)).toBe(true);

    expect(pinAfterAtBottom(reading, true)).toEqual(settled);
  });

  it('backfills a short page that cannot scroll, once', () => {
    const settled = pinAfterAtBottom(pinForNewConversation(), true);
    expect(shouldBackfillShortThread(settled, true, false)).toBe(true);
    expect(shouldBackfillShortThread(settled, false, false)).toBe(false);
    expect(shouldBackfillShortThread(settled, true, true)).toBe(false);
    expect(shouldBackfillShortThread(pinForNewConversation(), true, false)).toBe(false);
    expect(shouldBackfillShortThread(pinAfterAtBottom(settled, false), true, false)).toBe(false);
  });
});

describe('firstItemIndex across prepends and conversation replacement', () => {
  const origin = CHAT_LIST_INDEX_ORIGIN;

  it('decreases by the number of rows actually prepended', () => {
    const prev = [row('m0'), row('m1')];
    const next = [row('older0'), row('older1'), row('m0'), row('m1')];
    expect(nextFirstItemIndex(origin, prev, next)).toBe(origin - 2);
    expect(absoluteMessageIndex(origin - 2, 2)).toBe(origin);
  });

  it('stays put when rows are only appended', () => {
    const prev = [row('m0'), row('m1')];
    const next = [row('m0'), row('m1'), row('m2')];
    expect(nextFirstItemIndex(origin, prev, next)).toBe(origin);
    expect(absoluteMessageIndex(origin, next.length - 1)).toBe(origin + 2);
  });

  it('increases when a full window trims rows off the head', () => {
    const prev = [row('m0'), row('m1'), row('m2')];
    const next = [row('m1'), row('m2'), row('m3')];
    expect(nextFirstItemIndex(origin, prev, next)).toBe(origin + 1);
  });

  it('resets when the next window is a different conversation', () => {
    const prev = [row('general-1'), row('general-2')];
    const next = [row('dm-1'), row('dm-2')];
    expect(nextFirstItemIndex(origin - 40, prev, next)).toBe(origin);
    expect(nextFirstItemIndex(origin, [], next)).toBe(origin);
    expect(nextFirstItemIndex(origin, prev, [])).toBe(origin);
  });
});
