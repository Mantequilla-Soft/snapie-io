import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

export interface BlocksPlayerIdentity {
  playerId: string;
  username: string | null;
  isGuest: boolean;
}

const GUEST_ID = /^guest_[0-9a-f-]{36}$/;
const HIVE_NAME = /^[a-z0-9.-]{3,16}$/;

function secret(): string {
  const value = process.env.CHAT_JWT_SECRET;
  if (!value) throw new Error('CHAT_JWT_SECRET is not defined');
  return value;
}

/** Same JWT the chat session uses (`{ sub: username }`), or a Blocks guest token. */
export function readBlocksPlayer(token: string | null | undefined): BlocksPlayerIdentity | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret()) as { sub?: unknown; role?: unknown };
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    if (payload.role === 'blocks-guest') {
      if (!GUEST_ID.test(payload.sub)) return null;
      return { playerId: payload.sub, username: null, isGuest: true };
    }
    // Reject anything that isn't a plain chat session so a guest token can't
    // be reshaped into a username, and a guest id can't ride a user session.
    if (payload.role !== undefined) return null;
    if (!HIVE_NAME.test(payload.sub) || payload.sub.startsWith('guest_')) return null;
    return { playerId: payload.sub, username: payload.sub, isGuest: false };
  } catch {
    return null;
  }
}

export function signBlocksGuestToken(playerId: string): string {
  if (!GUEST_ID.test(playerId)) throw new Error('invalid guest id');
  return jwt.sign({ sub: playerId, role: 'blocks-guest' }, secret(), { expiresIn: '12h' });
}

export function newGuestPlayer(): { player: BlocksPlayerIdentity; token: string } {
  const playerId = `guest_${randomUUID()}`;
  return {
    player: { playerId, username: null, isGuest: true },
    token: signBlocksGuestToken(playerId),
  };
}

export function readBlocksPlayerFromRequest(req: {
  headers: { get(name: string): string | null };
}): BlocksPlayerIdentity | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  return readBlocksPlayer(header.slice(7).trim());
}
