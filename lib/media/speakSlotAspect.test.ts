import { describe, expect, it } from 'vitest';
import { speakSlotAspect } from './speakSlotAspect';

describe('speakSlotAspect', () => {
  it('stays 16/9 until the player reports portrait', () => {
    expect(speakSlotAspect({
      knownVertical: false,
      reportedVertical: false,
      top: 2000,
      viewportHeight: 800,
    })).toBe('16/9');
  });

  it('adopts 3/4 only while the slot is still below the viewport', () => {
    expect(speakSlotAspect({
      knownVertical: false,
      reportedVertical: true,
      top: 900,
      viewportHeight: 800,
    })).toBe('3/4');
    expect(speakSlotAspect({
      knownVertical: false,
      reportedVertical: true,
      top: 100,
      viewportHeight: 800,
    })).toBe('16/9');
  });

  it('uses a ratio learned earlier even when the slot is already visible', () => {
    expect(speakSlotAspect({
      knownVertical: true,
      reportedVertical: true,
      top: 40,
      viewportHeight: 800,
    })).toBe('3/4');
  });
});
