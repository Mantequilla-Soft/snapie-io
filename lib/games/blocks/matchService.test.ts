import { randomBytes } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCKS_DISCONNECT_MS,
  BLOCKS_MATCH_TTL_MS,
  BLOCKS_QUEUE_PRESENCE_MS,
  BLOCKS_QUEUE_TIMEOUT_MS,
  BLOCKS_RESULT_TTL_MS,
} from '@/lib/games/blocks/constants';
import { cloneMatch, type MatchDoc } from '@/lib/games/blocks/matchDomain';
import { matchAction, queueTick, setBlocksStore, type BlocksStore } from '@/lib/games/blocks/matchService';
import type { BlocksView, FinishSignal, Slot } from '@/lib/games/blocks/matchDomain';

vi.mock('@/lib/games/scoreService', () => ({
  awardFlatWin: vi.fn(async () => ({ status: 'awarded', pointsAwarded: 20, balance: 40 })),
}));

import { awardFlatWin } from '@/lib/games/scoreService';

const alice = { playerId: 'alice', username: 'alice', isGuest: false };
const bob = { playerId: 'bob', username: 'bob', isGuest: false };
const guest = {
  playerId: 'guest_11111111-1111-4111-8111-111111111111',
  username: null,
  isGuest: true,
};

function createMemoryStore() {
  const docs: MatchDoc[] = [];
  const store: BlocksStore = {
    async findActive(playerId) {
      const found = docs
        .filter((doc) => doc.status === 'active' && doc.players.some((player) => player.playerId === playerId))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return found[0] ? cloneMatch(found[0]) : null;
    },
    async findWaiting(playerId) {
      const found = docs.find((doc) => doc.status === 'waiting' && doc.queuePlayerId === playerId);
      return found ? cloneMatch(found) : null;
    },
    async claimWaiting(joiner: Slot, now: number, joinerAlreadyWaiting: boolean) {
      const host = docs
        .filter((doc) => {
          if (doc.status !== 'waiting' || !doc.queuePlayerId) return false;
          if (doc.expiresAt <= now) return false;
          if ((doc.players[0]?.lastSeenAt ?? 0) <= now - BLOCKS_QUEUE_PRESENCE_MS) return false;
          if (joinerAlreadyWaiting) return doc.queuePlayerId < joiner.playerId;
          return doc.queuePlayerId !== joiner.playerId;
        })
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!host) return null;
      host.status = 'active';
      host.queuePlayerId = null;
      host.startedAt = now;
      host.updatedAt = now;
      host.expiresAt = now + BLOCKS_MATCH_TTL_MS;
      host.players.push({ ...joiner });
      return cloneMatch(host);
    },
    async insertWaiting(doc) {
      const existing = docs.find((row) => row.status === 'waiting' && row.queuePlayerId === doc.queuePlayerId);
      if (existing) return cloneMatch(existing);
      const created = cloneMatch({ ...doc, _id: randomBytes(12).toString('hex') });
      docs.push(created);
      return cloneMatch(created);
    },
    async expireWaiting(playerId, now) {
      for (const doc of docs) {
        if (doc.status === 'waiting' && doc.queuePlayerId === playerId) {
          doc.status = 'expired';
          doc.queuePlayerId = null;
          doc.updatedAt = now;
        }
      }
    },
    async touchWaiting(id, now) {
      const doc = docs.find((row) => row._id === id && row.status === 'waiting');
      if (!doc?.players[0]) return;
      doc.players[0].lastSeenAt = now;
      doc.updatedAt = now;
    },
    async load(id) {
      const doc = docs.find((row) => row._id === id);
      return doc ? cloneMatch(doc) : null;
    },
    async casActive(doc, prevUpdatedAt) {
      const cur = docs.find((row) => row._id === doc._id);
      if (!cur || cur.status !== 'active' || cur.updatedAt !== prevUpdatedAt) return null;
      cur.players = doc.players.map((player) => ({ ...player }));
      cur.garbage = doc.garbage.map((row) => ({ ...row }));
      cur.seenAttackIds = [...doc.seenAttackIds];
      cur.updatedAt = doc.updatedAt;
      cur.expiresAt = doc.expiresAt;
      return cloneMatch(cur);
    },
    async casFinish(doc, finish: FinishSignal, now: number) {
      const cur = docs.find((row) => row._id === doc._id);
      if (!cur || cur.status !== 'active') return false;
      cur.status = 'finished';
      cur.winnerId = finish.winnerId;
      cur.winReason = finish.reason;
      cur.players = doc.players.map((player) => ({ ...player }));
      cur.garbage = doc.garbage.map((row) => ({ ...row }));
      cur.seenAttackIds = [...doc.seenAttackIds];
      cur.pointsAwarded = 0;
      cur.awardStatus = 'pending';
      cur.queuePlayerId = null;
      cur.updatedAt = doc.updatedAt;
      cur.expiresAt = now + BLOCKS_RESULT_TTL_MS;
      return true;
    },
    async setAward(id, points, status) {
      const cur = docs.find((row) => row._id === id);
      if (!cur) return;
      cur.pointsAwarded = points;
      cur.awardStatus = status;
    },
  };
  return { store, docs };
}

function viewOf(result: BlocksView | { error: string }): BlocksView {
  if ('error' in result) throw new Error(result.error);
  return result;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_POINTS = 'true';
  process.env.NEXT_PUBLIC_ENABLE_GAMES = 'true';
  vi.mocked(awardFlatWin).mockClear();
  setBlocksStore(null);
});

describe('blocks match lifecycle', () => {
  it('pairs a queue, delivers garbage, and awards the logged-in winner once', async () => {
    const { store, docs } = createMemoryStore();
    setBlocksStore(store);
    const t = 1_700_000_000_000;

    const waiting = await queueTick(alice, t);
    expect(waiting.phase).toBe('waiting');
    const joined = viewOf(await queueTick(bob, t + 20));
    expect(joined.phase).toBe('playing');
    expect(joined.opponent?.name).toBe('alice');
    const host = viewOf(await queueTick(alice, t + 40));
    expect(host.phase).toBe('playing');
    expect(host.matchId).toBe(joined.matchId);
    expect(docs.filter((doc) => doc.status === 'active')).toHaveLength(1);

    const matchId = joined.matchId!;
    const attack = viewOf(
      await matchAction(bob, matchId, { type: 'attack', lines: 4, eventId: 'tetris_bob_1' }, t + 500),
    );
    expect(attack.you?.linesSent).toBe(4);
    expect(vi.mocked(awardFlatWin)).not.toHaveBeenCalled();

    const hit = viewOf(await matchAction(alice, matchId, { type: 'poll' }, t + 700));
    expect(hit.you?.hp).toBe(60);
    expect(hit.incoming).toEqual([expect.objectContaining({ lines: 4 })]);
    const garbageId = hit.incoming[0]!.id;

    const acked = viewOf(await matchAction(alice, matchId, { type: 'poll', ack: [garbageId] }, t + 900));
    expect(acked.incoming).toEqual([]);

    const ko = viewOf(await matchAction(alice, matchId, { type: 'ko' }, t + 1200));
    expect(ko.winner).toBe('opponent');
    expect(ko.winReason).toBe('ko');
    expect(vi.mocked(awardFlatWin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(awardFlatWin)).toHaveBeenCalledWith('bob', 'snapie-blocks', matchId);

    const bobView = viewOf(await matchAction(bob, matchId, { type: 'poll' }, t + 1400));
    expect(bobView.winner).toBe('you');
    expect(bobView.pointsAwarded).toBe(20);
    expect(bobView.awardStatus).toBe('awarded');

    await matchAction(alice, matchId, { type: 'ko' }, t + 1600);
    expect(vi.mocked(awardFlatWin)).toHaveBeenCalledTimes(1);
    setBlocksStore(null);
  });

  it('does not award a guest winner', async () => {
    const { store } = createMemoryStore();
    setBlocksStore(store);
    const t = 1_800_000_000_000;
    await queueTick(alice, t);
    const joined = viewOf(await queueTick(guest, t + 10));
    const matchId = joined.matchId!;
    await matchAction(alice, matchId, { type: 'ko' }, t + 100);
    expect(vi.mocked(awardFlatWin)).not.toHaveBeenCalled();
    const guestView = viewOf(await matchAction(guest, matchId, { type: 'poll' }, t + 200));
    expect(guestView.winner).toBe('you');
    expect(guestView.pointsAwarded).toBe(0);
    expect(guestView.awardStatus).toBe('guest');
    setBlocksStore(null);
  });

  it('awards a forfeit and a disconnect to the player still present', async () => {
    const { store, docs } = createMemoryStore();
    setBlocksStore(store);
    const t = 1_900_000_000_000;
    await queueTick(alice, t);
    const joined = viewOf(await queueTick(bob, t + 10));
    const matchId = joined.matchId!;

    const forfeited = viewOf(await matchAction(bob, matchId, { type: 'forfeit' }, t + 100));
    expect(forfeited.winner).toBe('opponent');
    expect(forfeited.winReason).toBe('forfeit');
    expect(vi.mocked(awardFlatWin)).toHaveBeenCalledWith('alice', 'snapie-blocks', matchId);
    await matchAction(bob, matchId, { type: 'forfeit' }, t + 200);
    expect(vi.mocked(awardFlatWin)).toHaveBeenCalledTimes(1);
    setBlocksStore(null);

    const second = createMemoryStore();
    setBlocksStore(second.store);
    vi.mocked(awardFlatWin).mockClear();
    await queueTick(alice, t);
    const live = viewOf(await queueTick(bob, t + 10));
    const doc = second.docs.find((row) => row._id === live.matchId);
    expect(doc).toBeTruthy();
    doc!.startedAt = t - BLOCKS_DISCONNECT_MS - 1000;
    const bobSlot = doc!.players.find((player) => player.playerId === 'bob');
    bobSlot!.lastSeenAt = t - BLOCKS_DISCONNECT_MS - 1000;
    const disconnected = viewOf(await matchAction(alice, live.matchId!, { type: 'poll' }, t + 50));
    expect(disconnected.winner).toBe('you');
    expect(disconnected.winReason).toBe('disconnect');
    expect(vi.mocked(awardFlatWin)).toHaveBeenCalledWith('alice', 'snapie-blocks', live.matchId);
    expect(docs).not.toBe(second.docs);
    setBlocksStore(null);
  });

  it('times out a lonely queue ticket and only pairs two waiting players once', async () => {
    const { store, docs } = createMemoryStore();
    setBlocksStore(store);
    const t = 2_000_000_000_000;
    const ticket = await queueTick(alice, t);
    expect(ticket.phase).toBe('waiting');
    const again = await queueTick(alice, t + 1000);
    expect(again.matchId).toBe(ticket.matchId);
    const timedOut = await queueTick(alice, t + BLOCKS_QUEUE_TIMEOUT_MS + 5);
    expect(timedOut.phase).toBe('timeout');

    const fresh = createMemoryStore();
    setBlocksStore(fresh.store);
    const t2 = 3_000_000_000_000;
    await queueTick(alice, t2);
    await queueTick(bob, t2 + BLOCKS_QUEUE_PRESENCE_MS + 1000);
    await queueTick(alice, t2 + BLOCKS_QUEUE_PRESENCE_MS + 1500);
    const paired = viewOf(await queueTick(bob, t2 + BLOCKS_QUEUE_PRESENCE_MS + 1600));
    expect(paired.phase).toBe('playing');
    expect(fresh.docs.filter((doc) => doc.status === 'active')).toHaveLength(1);
    const host = viewOf(await queueTick(alice, t2 + BLOCKS_QUEUE_PRESENCE_MS + 1700));
    expect(host.matchId).toBe(paired.matchId);
    expect(docs.filter((doc) => doc.status === 'active')).toHaveLength(0);
    setBlocksStore(null);
  });

  it('returns the claimed match when the opponent pairs during a queue refresh', async () => {
    const { store } = createMemoryStore();
    setBlocksStore(store);
    const t = 4_000_000_000_000;
    const ticket = await queueTick(alice, t);
    expect(ticket.phase).toBe('waiting');
    const touch = store.touchWaiting.bind(store);
    store.touchWaiting = async (id, now) => {
      await queueTick(bob, now);
      await touch(id, now);
    };
    const refreshed = await queueTick(alice, t + 1000);
    expect(refreshed.phase).toBe('playing');
    expect(refreshed.matchId).toBe(ticket.matchId);
    expect(refreshed.opponent?.name).toBe('bob');
    setBlocksStore(null);
  });

  it('skips the points call when the points flag is off', async () => {
    process.env.NEXT_PUBLIC_ENABLE_POINTS = 'false';
    const { store } = createMemoryStore();
    setBlocksStore(store);
    const t = 4_000_000_000_000;
    await queueTick(alice, t);
    const joined = viewOf(await queueTick(bob, t + 10));
    await matchAction(alice, joined.matchId!, { type: 'ko' }, t + 100);
    expect(vi.mocked(awardFlatWin)).not.toHaveBeenCalled();
    const winner = viewOf(await matchAction(bob, joined.matchId!, { type: 'poll' }, t + 200));
    expect(winner.awardStatus).toBe('points_disabled');
    setBlocksStore(null);
  });
});
