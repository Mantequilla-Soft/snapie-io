import { passesPointsAllowlist } from '@/lib/points/config';
import { awardFlatWin } from '@/lib/games/scoreService';
import { BLOCKS_GAME_ID, BLOCKS_QUEUE_TIMEOUT_MS } from '@/lib/games/blocks/constants';
import type { BlocksPlayerIdentity } from '@/lib/games/blocks/auth';
import {
  emptyView,
  makeSlot,
  reduceMatch,
  toView,
  type BlocksView,
  type FinishSignal,
  type MatchAction,
  type MatchDoc,
  type Slot,
} from '@/lib/games/blocks/matchDomain';

export interface BlocksStore {
  findActive(playerId: string): Promise<MatchDoc | null>;
  findWaiting(playerId: string): Promise<MatchDoc | null>;
  claimWaiting(joiner: Slot, now: number, joinerAlreadyWaiting: boolean): Promise<MatchDoc | null>;
  insertWaiting(doc: MatchDoc): Promise<MatchDoc>;
  expireWaiting(playerId: string, now: number): Promise<void>;
  touchWaiting(id: string, now: number): Promise<void>;
  load(id: string): Promise<MatchDoc | null>;
  casActive(doc: MatchDoc, prevUpdatedAt: number): Promise<MatchDoc | null>;
  casFinish(doc: MatchDoc, finish: FinishSignal, now: number): Promise<boolean>;
  setAward(id: string, points: number, status: string): Promise<void>;
}

export type ClientMatchAction =
  | { type: 'poll'; ack?: string[] }
  | { type: 'attack'; lines: number; eventId: string }
  | { type: 'ko' }
  | { type: 'forfeit' };

let injected: BlocksStore | null = null;
let mongoStore: BlocksStore | null = null;

/** Tests inject an in-memory store. Production uses Mongo. */
export function setBlocksStore(store: BlocksStore | null) {
  injected = store;
}

async function store(): Promise<BlocksStore> {
  if (injected) return injected;
  if (!mongoStore) {
    const mod = await import('@/lib/games/blocks/blocksStore');
    mongoStore = mod.mongoBlocksStore;
  }
  return mongoStore;
}

function pointsAwardsEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_POINTS === 'true' && process.env.NEXT_PUBLIC_ENABLE_GAMES === 'true'
  );
}

const TERMINAL_AWARD = new Set([
  'awarded',
  'duplicate',
  'capped',
  'guest',
  'points_disabled',
  'ineligible',
  'none',
  'invalid_score',
  'unknown_game',
]);

function waitingDoc(slot: Slot, now: number): MatchDoc {
  return {
    _id: '',
    status: 'waiting',
    queuePlayerId: slot.playerId,
    players: [slot],
    garbage: [],
    seenAttackIds: [],
    winnerId: null,
    winReason: null,
    pointsAwarded: 0,
    awardStatus: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    expiresAt: now + BLOCKS_QUEUE_TIMEOUT_MS,
  };
}

async function ensureAward(db: BlocksStore, doc: MatchDoc): Promise<MatchDoc> {
  if (doc.status !== 'finished') return doc;
  if (doc.awardStatus && TERMINAL_AWARD.has(doc.awardStatus)) return doc;
  if (!doc.winnerId) {
    await db.setAward(doc._id, 0, 'none');
    return { ...doc, pointsAwarded: 0, awardStatus: 'none' };
  }
  const winner = doc.players.find((player) => player.playerId === doc.winnerId);
  if (!winner || winner.isGuest || !winner.username) {
    await db.setAward(doc._id, 0, 'guest');
    return { ...doc, pointsAwarded: 0, awardStatus: 'guest' };
  }
  if (!pointsAwardsEnabled()) {
    await db.setAward(doc._id, 0, 'points_disabled');
    return { ...doc, pointsAwarded: 0, awardStatus: 'points_disabled' };
  }
  if (!passesPointsAllowlist(winner.username)) {
    await db.setAward(doc._id, 0, 'ineligible');
    return { ...doc, pointsAwarded: 0, awardStatus: 'ineligible' };
  }
  try {
    const result = await awardFlatWin(winner.username, BLOCKS_GAME_ID, doc._id);
    await db.setAward(doc._id, result.pointsAwarded, result.status);
    return { ...doc, pointsAwarded: result.pointsAwarded, awardStatus: result.status };
  } catch {
    await db.setAward(doc._id, 0, 'error');
    return { ...doc, pointsAwarded: 0, awardStatus: 'error' };
  }
}

async function applyLive(db: BlocksStore, doc: MatchDoc, action: MatchAction, now: number): Promise<BlocksView> {
  let current: MatchDoc | null = doc;
  for (let attempt = 0; attempt < 3 && current; attempt++) {
    if (current.status !== 'active') {
      return toView(await ensureAward(db, current), action.playerId);
    }
    let n = 0;
    const reduced = reduceMatch(current, action, now, () => {
      n += 1;
      return `g${now.toString(16)}${n.toString(16)}a`;
    });
    if (reduced.finish) {
      const won = await db.casFinish(reduced.doc, reduced.finish, now);
      if (!won) {
        current = await db.load(doc._id);
        continue;
      }
      const finished = await db.load(doc._id);
      if (!finished) return emptyView();
      return toView(await ensureAward(db, finished), action.playerId);
    }
    const saved = await db.casActive(reduced.doc, current.updatedAt);
    if (saved) return toView(saved, action.playerId);
    current = await db.load(doc._id);
  }
  const latest = current ?? (await db.load(doc._id));
  if (!latest) return emptyView();
  return toView(await ensureAward(db, latest), action.playerId);
}

/**
 * Join the public queue or refresh a ticket. Two waiting players collapse
 * into one active match: if both already hold a ticket, only the player
 * with the greater id claims, so they can't pair into two matches.
 */
export async function queueTick(player: BlocksPlayerIdentity, now = Date.now()): Promise<BlocksView> {
  const db = await store();
  const active = await db.findActive(player.playerId);
  if (active) {
    await db.expireWaiting(player.playerId, now);
    return applyLive(db, active, { type: 'poll', playerId: player.playerId }, now);
  }

  const existing = await db.findWaiting(player.playerId);
  const claimed = await db.claimWaiting(makeSlot(player, now), now, existing != null);
  if (claimed) {
    await db.expireWaiting(player.playerId, now);
    return toView(claimed, player.playerId);
  }

  const activeAfter = await db.findActive(player.playerId);
  if (activeAfter) {
    await db.expireWaiting(player.playerId, now);
    return applyLive(db, activeAfter, { type: 'poll', playerId: player.playerId }, now);
  }

  const waiting = await db.findWaiting(player.playerId);
  if (waiting) {
    if (waiting.expiresAt <= now) {
      await db.expireWaiting(player.playerId, now);
      return { ...emptyView(), matchId: waiting._id, phase: 'timeout' };
    }
    await db.touchWaiting(waiting._id, now);
    // A claim can land while this refresh is in flight. touchWaiting only
    // writes waiting rows, so read back instead of echoing a stale ticket.
    const latest = await db.load(waiting._id);
    if (!latest) return emptyView();
    if (latest.status !== 'waiting') {
      return applyLive(db, latest, { type: 'poll', playerId: player.playerId }, now);
    }
    return toView(latest, player.playerId);
  }

  const created = await db.insertWaiting(waitingDoc(makeSlot(player, now), now));
  return toView(created, player.playerId);
}

/** Leave the queue, or forfeit an active match. The opponent is the winner. */
export async function leaveQueue(player: BlocksPlayerIdentity, now = Date.now()): Promise<BlocksView> {
  const db = await store();
  const active = await db.findActive(player.playerId);
  if (active) return applyLive(db, active, { type: 'forfeit', playerId: player.playerId }, now);
  await db.expireWaiting(player.playerId, now);
  return emptyView();
}

export async function matchAction(
  player: BlocksPlayerIdentity,
  matchId: string,
  action: ClientMatchAction,
  now = Date.now(),
): Promise<BlocksView | { error: 'not_found' | 'forbidden' }> {
  const db = await store();
  const doc = await db.load(matchId);
  if (!doc) return { error: 'not_found' };
  if (!doc.players.some((slot) => slot.playerId === player.playerId)) return { error: 'forbidden' };
  if (action.type === 'forfeit' && doc.status === 'waiting') {
    await db.expireWaiting(player.playerId, now);
    return emptyView();
  }
  const full = { ...action, playerId: player.playerId } as MatchAction;
  return applyLive(db, doc, full, now);
}
