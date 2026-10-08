import { describe, expect, it } from 'vitest';
import {
  BLOCKS_GUEST_BANNER,
  blocksPointsNotice,
  blocksYouWonLine,
  canReplaceBlocksSession,
} from './pointsNotice';

describe('blocksPointsNotice', () => {
  it('keeps the guest line for someone who is not logged in', () => {
    expect(blocksPointsNotice({ loggedIn: false, guestSession: true, signDeclined: false })).toBe('guest');
    expect(BLOCKS_GUEST_BANNER).toMatch(/Playing as a guest/);
  });

  it('tells a logged-in user who skipped the signature that points are off', () => {
    expect(blocksPointsNotice({ loggedIn: true, guestSession: true, signDeclined: true })).toBe('skipped');
  });

  it('does not call a signed-in player a guest', () => {
    expect(blocksPointsNotice({ loggedIn: true, guestSession: false, signDeclined: false })).toBe('earning');
    expect(blocksPointsNotice({ loggedIn: true, guestSession: true, signDeclined: false })).toBe('hidden');
  });
});

describe('canReplaceBlocksSession', () => {
  it('switches the ticket only when no match is in flight', () => {
    expect(canReplaceBlocksSession('idle')).toBe(true);
    expect(canReplaceBlocksSession('timeout')).toBe(true);
    expect(canReplaceBlocksSession('playing')).toBe(false);
    expect(canReplaceBlocksSession('queuing')).toBe(false);
    expect(canReplaceBlocksSession('waiting')).toBe(false);
    expect(canReplaceBlocksSession('finished')).toBe(false);
  });
});

describe('blocksYouWonLine', () => {
  it('keeps the guest win line for a real guest', () => {
    expect(blocksYouWonLine({
      loggedIn: false,
      guestSession: true,
      armedForNext: false,
      pointsAwarded: 0,
      winPoints: 20,
    })).toMatch(/Guests don't earn Snapie Points/);
  });

  it('says a skipped signature, not a logout, when the player is logged in', () => {
    expect(blocksYouWonLine({
      loggedIn: true,
      guestSession: true,
      armedForNext: false,
      pointsAwarded: 0,
      winPoints: 20,
    })).toMatch(/signature was skipped/);
  });

  it('reports the server award once the Hive session is in use', () => {
    expect(blocksYouWonLine({
      loggedIn: true,
      guestSession: false,
      armedForNext: false,
      awardStatus: 'awarded',
      pointsAwarded: 20,
      winPoints: 20,
    })).toBe('You won. +20 Snapie Points.');
  });

  it('keeps this match unpaid after points are armed for the next one', () => {
    expect(blocksYouWonLine({
      loggedIn: true,
      guestSession: true,
      armedForNext: true,
      pointsAwarded: 0,
      winPoints: 20,
    })).toMatch(/next one can/);
    expect(blocksYouWonLine({
      loggedIn: true,
      guestSession: false,
      armedForNext: false,
      awardStatus: 'capped',
      pointsAwarded: 0,
      winPoints: 20,
    })).toMatch(/daily points cap/);
    expect(blocksYouWonLine({
      loggedIn: true,
      guestSession: false,
      armedForNext: false,
      awardStatus: 'pending',
      pointsAwarded: 0,
      winPoints: 20,
    })).toBe('You won.');
  });
});
