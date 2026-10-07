import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { newGuestPlayer, readBlocksPlayer, readBlocksPlayerFromRequest, signBlocksGuestToken } from '@/lib/games/blocks/auth';

beforeEach(() => {
  process.env.CHAT_JWT_SECRET = 'blocks-test-secret';
});

describe('blocks player tokens', () => {
  it('round-trips a guest and accepts a chat session', () => {
    const guest = newGuestPlayer();
    expect(readBlocksPlayer(guest.token)).toEqual(guest.player);
    expect(guest.player.isGuest).toBe(true);

    const user = jwt.sign({ sub: 'alice' }, 'blocks-test-secret', { expiresIn: '1h' });
    expect(readBlocksPlayer(user)).toEqual({ playerId: 'alice', username: 'alice', isGuest: false });
    expect(
      readBlocksPlayerFromRequest({ headers: { get: () => `Bearer ${user}` } })?.username,
    ).toBe('alice');
  });

  it('rejects a guest role stamped onto a username and a bad signature', () => {
    const forged = jwt.sign({ sub: 'alice', role: 'blocks-guest' }, 'blocks-test-secret', { expiresIn: '1h' });
    expect(readBlocksPlayer(forged)).toBeNull();
    expect(readBlocksPlayer(jwt.sign({ sub: 'alice' }, 'other-secret'))).toBeNull();
    expect(readBlocksPlayer(null)).toBeNull();
    expect(() => signBlocksGuestToken('alice')).toThrow(/guest/);
  });
});
