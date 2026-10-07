import { connectDB } from '@/lib/db/mongodb';
import { BlocksMatch, type BlocksMatchMongo } from '@/lib/db/models/BlocksMatch';
import {
  BLOCKS_MATCH_TTL_MS,
  BLOCKS_QUEUE_PRESENCE_MS,
  BLOCKS_RESULT_TTL_MS,
} from '@/lib/games/blocks/constants';
import type { FinishSignal, MatchDoc, Slot } from '@/lib/games/blocks/matchDomain';
import type { BlocksStore } from '@/lib/games/blocks/matchService';

function ms(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function slotFromMongo(slot: BlocksMatchMongo['players'][number]): Slot {
  return {
    playerId: slot.playerId,
    username: slot.username ?? null,
    isGuest: slot.isGuest,
    hp: slot.hp,
    linesSent: slot.linesSent,
    alive: slot.alive,
    lastSeenAt: ms(slot.lastSeenAt) ?? 0,
    lastAttackAt: slot.lastAttackAt ? ms(slot.lastAttackAt) : null,
  };
}

function slotToMongo(slot: Slot) {
  return {
    playerId: slot.playerId,
    username: slot.username,
    isGuest: slot.isGuest,
    hp: slot.hp,
    linesSent: slot.linesSent,
    alive: slot.alive,
    lastSeenAt: new Date(slot.lastSeenAt),
    lastAttackAt: slot.lastAttackAt == null ? null : new Date(slot.lastAttackAt),
  };
}

function fromLean(raw: BlocksMatchMongo): MatchDoc {
  return {
    _id: String(raw._id),
    status: raw.status,
    queuePlayerId: raw.queuePlayerId ?? null,
    players: (raw.players ?? []).map(slotFromMongo),
    garbage: (raw.garbage ?? []).map((row) => ({ id: row.id, toPlayerId: row.toPlayerId, lines: row.lines })),
    seenAttackIds: [...(raw.seenAttackIds ?? [])],
    winnerId: raw.winnerId ?? null,
    winReason: raw.winReason ?? null,
    pointsAwarded: raw.pointsAwarded ?? 0,
    awardStatus: raw.awardStatus ?? null,
    createdAt: ms(raw.createdAt) ?? 0,
    updatedAt: ms(raw.updatedAt) ?? 0,
    startedAt: raw.startedAt ? ms(raw.startedAt) : null,
    expiresAt: ms(raw.expiresAt) ?? 0,
  };
}

async function ready() {
  await connectDB();
}

export const mongoBlocksStore: BlocksStore = {
  async findActive(playerId) {
    await ready();
    const raw = await BlocksMatch.findOne({ status: 'active', 'players.playerId': playerId })
      .sort({ updatedAt: -1 })
      .lean();
    return raw ? fromLean(raw as BlocksMatchMongo) : null;
  },

  async findWaiting(playerId) {
    await ready();
    const raw = await BlocksMatch.findOne({ status: 'waiting', queuePlayerId: playerId }).lean();
    return raw ? fromLean(raw as BlocksMatchMongo) : null;
  },

  async claimWaiting(joiner, now, joinerAlreadyWaiting) {
    await ready();
    const filter: Record<string, unknown> = {
      status: 'waiting',
      expiresAt: { $gt: new Date(now) },
      'players.0.lastSeenAt': { $gt: new Date(now - BLOCKS_QUEUE_PRESENCE_MS) },
      queuePlayerId: joinerAlreadyWaiting ? { $lt: joiner.playerId } : { $ne: joiner.playerId },
    };
    const raw = await BlocksMatch.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'active',
          queuePlayerId: null,
          startedAt: new Date(now),
          updatedAt: new Date(now),
          expiresAt: new Date(now + BLOCKS_MATCH_TTL_MS),
        },
        $push: { players: slotToMongo(joiner) },
      },
      { sort: { createdAt: 1 }, new: true },
    ).lean();
    return raw ? fromLean(raw as BlocksMatchMongo) : null;
  },

  async insertWaiting(doc) {
    await ready();
    try {
      const created = await BlocksMatch.create({
        status: 'waiting',
        queuePlayerId: doc.queuePlayerId,
        players: doc.players.map(slotToMongo),
        garbage: doc.garbage,
        seenAttackIds: doc.seenAttackIds,
        winnerId: null,
        winReason: null,
        pointsAwarded: 0,
        awardStatus: null,
        startedAt: null,
        updatedAt: new Date(doc.updatedAt),
        expiresAt: new Date(doc.expiresAt),
      });
      return fromLean(created.toObject() as BlocksMatchMongo);
    } catch (err) {
      if ((err as { code?: number }).code === 11000 && doc.queuePlayerId) {
        const existing = await this.findWaiting(doc.queuePlayerId);
        if (existing) return existing;
      }
      throw err;
    }
  },

  async expireWaiting(playerId, now) {
    await ready();
    await BlocksMatch.updateMany(
      { status: 'waiting', queuePlayerId: playerId },
      { $set: { status: 'expired', queuePlayerId: null, updatedAt: new Date(now) } },
    );
  },

  async touchWaiting(id, now) {
    await ready();
    await BlocksMatch.updateOne(
      { _id: id, status: 'waiting' },
      { $set: { 'players.0.lastSeenAt': new Date(now), updatedAt: new Date(now) } },
    );
  },

  async load(id) {
    await ready();
    if (!/^[a-f0-9]{24}$/i.test(id)) return null;
    const raw = await BlocksMatch.findById(id).lean();
    return raw ? fromLean(raw as BlocksMatchMongo) : null;
  },

  async casActive(doc, prevUpdatedAt) {
    await ready();
    const raw = await BlocksMatch.findOneAndUpdate(
      { _id: doc._id, status: 'active', updatedAt: new Date(prevUpdatedAt) },
      {
        $set: {
          players: doc.players.map(slotToMongo),
          garbage: doc.garbage,
          seenAttackIds: doc.seenAttackIds,
          updatedAt: new Date(doc.updatedAt),
          expiresAt: new Date(doc.expiresAt),
        },
      },
      { new: true },
    ).lean();
    return raw ? fromLean(raw as BlocksMatchMongo) : null;
  },

  async casFinish(doc, finish: FinishSignal, now: number) {
    await ready();
    const raw = await BlocksMatch.findOneAndUpdate(
      { _id: doc._id, status: 'active' },
      {
        $set: {
          status: 'finished',
          winnerId: finish.winnerId,
          winReason: finish.reason,
          players: doc.players.map(slotToMongo),
          garbage: doc.garbage,
          seenAttackIds: doc.seenAttackIds,
          pointsAwarded: 0,
          awardStatus: 'pending',
          queuePlayerId: null,
          updatedAt: new Date(doc.updatedAt),
          expiresAt: new Date(now + BLOCKS_RESULT_TTL_MS),
        },
      },
      { new: true },
    ).lean();
    return raw != null;
  },

  async setAward(id, points, status) {
    await ready();
    await BlocksMatch.updateOne(
      { _id: id },
      { $set: { pointsAwarded: points, awardStatus: status } },
    );
  },
};
