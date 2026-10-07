import { describe, expect, it } from 'vitest';
import { BLOCKS_HP_MAX } from '@/lib/games/blocks/constants';
import { makeSlot, reduceMatch, type MatchDoc } from '@/lib/games/blocks/matchDomain';

function active(now: number): MatchDoc {
  return {
    _id: 'a'.repeat(24),
    status: 'active',
    queuePlayerId: null,
    players: [
      makeSlot({ playerId: 'alice', username: 'alice', isGuest: false }, now),
      makeSlot({ playerId: 'bob', username: 'bob', isGuest: false }, now),
    ],
    garbage: [],
    seenAttackIds: [],
    winnerId: null,
    winReason: null,
    pointsAwarded: 0,
    awardStatus: null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    expiresAt: now + 60_000,
  };
}

const ids = (() => {
  let n = 0;
  return () => `garbage${String(++n).padStart(2, '0')}`;
})();

describe('reduceMatch', () => {
  it('sends classic garbage and ignores a single, a duplicate, and a too-fast clear', () => {
    const now = 1_000_000;
    const start = active(now);
    const single = reduceMatch(start, { type: 'attack', playerId: 'alice', lines: 1, eventId: 'single_01' }, now + 200, ids);
    expect(single.doc.players[0]!.linesSent).toBe(0);
    expect(single.doc.players[1]!.hp).toBe(BLOCKS_HP_MAX);
    expect(single.finish).toBeNull();

    const tetris = reduceMatch(
      single.doc,
      { type: 'attack', playerId: 'alice', lines: 4, eventId: 'tetris_01' },
      now + 400,
      ids,
    );
    expect(tetris.doc.players[0]!.linesSent).toBe(4);
    expect(tetris.doc.players[1]!.hp).toBe(BLOCKS_HP_MAX - 40);
    expect(tetris.doc.garbage).toHaveLength(1);

    const dup = reduceMatch(
      tetris.doc,
      { type: 'attack', playerId: 'alice', lines: 4, eventId: 'tetris_01' },
      now + 800,
      ids,
    );
    expect(dup.doc.players[1]!.hp).toBe(BLOCKS_HP_MAX - 40);

    const rushed = reduceMatch(
      dup.doc,
      { type: 'attack', playerId: 'alice', lines: 2, eventId: 'double_01' },
      now + 500,
      ids,
    );
    expect(rushed.doc.players[0]!.linesSent).toBe(4);
  });

  it('acks garbage, KOs the sender, and forfeits to the opponent', () => {
    const now = 2_000_000;
    const doc = active(now);
    doc.garbage.push({ id: 'garbage01', toPlayerId: 'bob', lines: 2 });
    const acked = reduceMatch(doc, { type: 'poll', playerId: 'bob', ack: ['garbage01', 'nope'] }, now + 100, ids);
    expect(acked.doc.garbage).toHaveLength(0);

    const ko = reduceMatch(acked.doc, { type: 'ko', playerId: 'alice' }, now + 200, ids);
    expect(ko.finish).toEqual({ winnerId: 'bob', reason: 'ko' });
    expect(ko.doc.players[0]!.alive).toBe(false);

    const again = reduceMatch({ ...ko.doc, status: 'active' }, { type: 'ko', playerId: 'alice' }, now + 300, ids);
    expect(again.finish).toBeNull();

    const forfeited = reduceMatch(active(now), { type: 'forfeit', playerId: 'alice' }, now + 400, ids);
    expect(forfeited.finish).toEqual({ winnerId: 'bob', reason: 'forfeit' });
  });

  it('gives the survivor the win when the opponent stops polling', () => {
    const now = 5_000_000;
    const doc = active(now - 20_000);
    doc.players[1]!.lastSeenAt = now - 20_000;
    doc.startedAt = now - 20_000;
    const result = reduceMatch(doc, { type: 'poll', playerId: 'alice' }, now, ids);
    expect(result.finish).toEqual({ winnerId: 'alice', reason: 'disconnect' });
  });

  it('does not disconnect a player who is still polling', () => {
    const now = 5_000_000;
    const doc = active(now - 3_000);
    const result = reduceMatch(doc, { type: 'poll', playerId: 'alice' }, now, ids);
    expect(result.finish).toBeNull();
  });
});
