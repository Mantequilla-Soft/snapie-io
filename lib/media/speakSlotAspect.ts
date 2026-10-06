export type SpeakAspect = '16/9' | '3/4';

const verticalSpeakKeys = new Set<string>();

export function isKnownVerticalSpeak(key: string): boolean {
  return verticalSpeakKeys.has(key);
}

export function rememberVerticalSpeak(key: string): void {
  verticalSpeakKeys.add(key);
}

/**
 * Portrait 3Speak is 3/4. Switching a slot that is already inside the
 * viewport grows every card below it. Below the fold, take 3/4 so the
 * box is final before it scrolls in. A ratio learned earlier is final
 * on the next mount, including when the slot is already visible.
 */
export function speakSlotAspect(opts: {
  knownVertical: boolean;
  reportedVertical: boolean;
  /** Top of the slot, relative to the viewport. */
  top: number;
  viewportHeight: number;
}): SpeakAspect {
  if (opts.knownVertical) return '3/4';
  if (!opts.reportedVertical) return '16/9';
  if (opts.top >= opts.viewportHeight) return '3/4';
  return '16/9';
}
