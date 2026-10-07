import {
  BLOCKS_ATTACK_MIN_MS,
  BLOCKS_DISCONNECT_MS,
  BLOCKS_HP_MAX,
  BLOCKS_HP_PER_GARBAGE_LINE,
  BLOCKS_MATCH_TTL_MS,
  garbageForLines,
} from '@/lib/games/blocks/constants';
import type { BlocksPlayerIdentity } from '@/lib/games/blocks/auth';

export type { BlocksPlayerIdentity };

export type WinReason = 'ko' | 'forfeit' | 'disconnect';

export interface Slot {
  playerId: string;
  username: string | null;
  isGuest: boolean;
  hp: number;
  linesSent: number;
  alive: boolean;
  lastSeenAt: number;
  lastAttackAt: number | null;
}

export interface GarbageRow {
  id: string;
  toPlayerId: string;
  lines: number;
}

export interface MatchDoc {
  _id: string;
  status: 'waiting' | 'active' | 'finished' | 'expired';
  queuePlayerId: string | null;
  players: Slot[];
  garbage: GarbageRow[];
  seenAttackIds: string[];
  winnerId: string | null;
  winReason: WinReason | null;
  pointsAwarded: number;
  awardStatus: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  expiresAt: number;
}

export type MatchAction =
  | { type: 'poll'; playerId: string; ack?: string[] }
  | { type: 'attack'; playerId: string; lines: number; eventId: string }
  | { type: 'ko'; playerId: string }
  | { type: 'forfeit'; playerId: string };

export interface BlocksView {
  matchId: string | null;
  phase: 'idle' | 'waiting' | 'playing' | 'finished' | 'timeout';
  you: { hp: number; linesSent: number; alive: boolean } | null;
  opponent: { name: string; hp: number; linesSent: number; alive: boolean } | null;
  incoming: { id: string; lines: number }[];
  winner: 'you' | 'opponent' | null;
  winReason: WinReason | null;
  pointsAwarded: number;
  awardStatus: string | null;
  queueExpiresAt: number | null;
  /** Match document time. Clients ignore an older snapshot of the same match. */
  updatedAt: number;
}

export interface FinishSignal {
  winnerId: string | null;
  reason: WinReason;
}

const EVENT_ID = /^[a-zA-Z0-9_-]{8,64}$/;
const SEEN_CAP = 80;

export function makeSlot(player: BlocksPlayerIdentity, now: number): Slot {
  return {
    playerId: player.playerId,
    username: player.username,
    isGuest: player.isGuest,
    hp: BLOCKS_HP_MAX,
    linesSent: 0,
    alive: true,
    lastSeenAt: now,
    lastAttackAt: null,
  };
}

export function cloneMatch(doc: MatchDoc): MatchDoc {
  return {
    ...doc,
    players: doc.players.map((player) => ({ ...player })),
    garbage: doc.garbage.map((row) => ({ ...row })),
    seenAttackIds: [...doc.seenAttackIds],
  };
}

function displayName(slot: Slot): string {
  if (slot.isGuest || !slot.username) return 'Guest';
  return slot.username;
}

export function emptyView(): BlocksView {
  return {
    matchId: null,
    phase: 'idle',
    you: null,
    opponent: null,
    incoming: [],
    winner: null,
    winReason: null,
    pointsAwarded: 0,
    awardStatus: null,
    queueExpiresAt: null,
    updatedAt: 0,
  };
}

export function toView(doc: MatchDoc | null, playerId: string): BlocksView {
  if (!doc) return emptyView();
  const me = doc.players.find((player) => player.playerId === playerId) ?? null;
  const opp = doc.players.find((player) => player.playerId !== playerId) ?? null;
  const phase =
    doc.status === 'waiting'
      ? 'waiting'
      : doc.status === 'active'
        ? 'playing'
        : doc.status === 'finished'
          ? 'finished'
          : 'timeout';
  const youWon = doc.status === 'finished' && doc.winnerId !== null && doc.winnerId === playerId;
  const winner =
    doc.status !== 'finished' || doc.winnerId === null
      ? null
      : doc.winnerId === playerId
        ? 'you'
        : 'opponent';
  return {
    matchId: doc._id,
    phase,
    you: me ? { hp: me.hp, linesSent: me.linesSent, alive: me.alive } : null,
    opponent: opp
      ? { name: displayName(opp), hp: opp.hp, linesSent: opp.linesSent, alive: opp.alive }
      : null,
    incoming: doc.garbage
      .filter((row) => row.toPlayerId === playerId)
      .map((row) => ({ id: row.id, lines: row.lines })),
    winner,
    winReason: doc.status === 'finished' ? doc.winReason : null,
    pointsAwarded: youWon ? doc.pointsAwarded : 0,
    awardStatus: youWon ? doc.awardStatus : null,
    queueExpiresAt: doc.status === 'waiting' ? doc.expiresAt : null,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Pure transition for an active match. Does not flip `status` — the store's
 * compare-and-set does that so two KOs can't both award points.
 * `doc` is not mutated.
 */
export function reduceMatch(
  doc: MatchDoc,
  action: MatchAction,
  now: number,
  nextGarbageId: () => string,
): { doc: MatchDoc; finish: FinishSignal | null } {
  const next = cloneMatch(doc);
  // Bump even when two actions share a millisecond so compare-and-set can
  // tell them apart and the loser retries against the winner's document.
  next.updatedAt = Math.max(now, doc.updatedAt + 1);
  if (next.status === 'active') {
    next.expiresAt = now + BLOCKS_MATCH_TTL_MS;
  }
  const me = next.players.find((player) => player.playerId === action.playerId);
  const opp = next.players.find((player) => player.playerId !== action.playerId);
  if (!me || next.status !== 'active') return { doc: next, finish: null };
  me.lastSeenAt = now;

  if (action.type === 'poll' && action.ack && action.ack.length > 0) {
    const ack = new Set(action.ack.slice(0, 40).filter((id) => EVENT_ID.test(id)));
    next.garbage = next.garbage.filter((row) => !(row.toPlayerId === me.playerId && ack.has(row.id)));
  }

  if (action.type === 'attack') {
    const garbage = garbageForLines(action.lines);
    const fresh =
      garbage !== null &&
      EVENT_ID.test(action.eventId) &&
      !next.seenAttackIds.includes(action.eventId) &&
      me.alive &&
      (me.lastAttackAt === null || now - me.lastAttackAt >= BLOCKS_ATTACK_MIN_MS);
    if (fresh && opp) {
      me.lastAttackAt = now;
      next.seenAttackIds.push(action.eventId);
      if (next.seenAttackIds.length > SEEN_CAP) {
        next.seenAttackIds.splice(0, next.seenAttackIds.length - SEEN_CAP);
      }
      if (garbage > 0) {
        me.linesSent += garbage;
        opp.hp = Math.max(0, opp.hp - garbage * BLOCKS_HP_PER_GARBAGE_LINE);
        next.garbage.push({ id: nextGarbageId(), toPlayerId: opp.playerId, lines: garbage });
      }
    }
  }

  if (action.type === 'ko' && me.alive) {
    me.alive = false;
    return {
      doc: next,
      finish: { winnerId: opp?.alive ? opp.playerId : null, reason: 'ko' },
    };
  }

  if (action.type === 'forfeit') {
    me.alive = false;
    return {
      doc: next,
      finish: { winnerId: opp?.playerId ?? null, reason: 'forfeit' },
    };
  }

  if (
    opp &&
    next.startedAt !== null &&
    now - opp.lastSeenAt > BLOCKS_DISCONNECT_MS &&
    now - next.startedAt > BLOCKS_DISCONNECT_MS
  ) {
    opp.alive = false;
    return { doc: next, finish: { winnerId: me.playerId, reason: 'disconnect' } };
  }

  return { doc: next, finish: null };
}
