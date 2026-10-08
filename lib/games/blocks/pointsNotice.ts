// Blocks plays a declined Keychain user on a guest match ticket, which used
// to read as "you are logged out". These helpers keep that ticket, and tell
// the truth about why points are off.

export const BLOCKS_GUEST_BANNER =
  'Playing as a guest. You can finish the match, and a win will not award Snapie Points.';

export const BLOCKS_SKIPPED_BANNER =
  'Snapie Points are off because you skipped the signature. A win will not award points.';

export const BLOCKS_NEXT_MATCH_BANNER =
  'Snapie Points are on for the next match. This one still will not award points.';

export type BlocksPointsNotice = 'guest' | 'skipped' | 'earning' | 'hidden';

export function blocksPointsNotice(input: {
  loggedIn: boolean;
  guestSession: boolean;
  signDeclined: boolean;
}): BlocksPointsNotice {
  if (!input.guestSession) return input.loggedIn ? 'earning' : 'hidden';
  if (!input.loggedIn) return 'guest';
  if (input.signDeclined) return 'skipped';
  return 'hidden';
}

/** A live queue or match must keep its ticket. Idle and timeout can switch. */
export function canReplaceBlocksSession(phase: string): boolean {
  return phase === 'idle' || phase === 'timeout';
}

export function blocksYouWonLine(input: {
  loggedIn: boolean;
  guestSession: boolean;
  armedForNext: boolean;
  awardStatus?: string | null;
  pointsAwarded: number;
  winPoints: number;
}): string {
  if (input.guestSession && !input.loggedIn) {
    return "You won. Guests don't earn Snapie Points — log in before the next match.";
  }
  if (input.guestSession && input.loggedIn) {
    return input.armedForNext
      ? 'You won. This match will not award Snapie Points. The next one can.'
      : 'You won. Snapie Points stayed off because the signature was skipped.';
  }
  if (input.awardStatus === 'awarded' || input.awardStatus === 'duplicate') {
    return `You won. +${input.pointsAwarded || input.winPoints} Snapie Points.`;
  }
  if (input.awardStatus === 'capped') return 'You won. The daily points cap is already full.';
  return 'You won.';
}
