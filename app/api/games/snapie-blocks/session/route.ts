import { NextRequest, NextResponse } from 'next/server';
import { newGuestPlayer, readBlocksPlayerFromRequest } from '@/lib/games/blocks/auth';
import { guardSessionMint } from '@/lib/games/blocks/routeGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Mint a guest session, or confirm the Hive chat session already on the request. */
export async function POST(req: NextRequest) {
  try {
    const limited = guardSessionMint(req);
    if (limited) return limited;

    const existing = readBlocksPlayerFromRequest(req);
    if (existing && !existing.isGuest) {
      return NextResponse.json({
        playerId: existing.playerId,
        username: existing.username,
        isGuest: false,
      });
    }
    if (existing?.isGuest) {
      const token = (req.headers.get('authorization') ?? '').slice(7).trim();
      return NextResponse.json({
        token,
        playerId: existing.playerId,
        username: null,
        isGuest: true,
      });
    }
    const guest = newGuestPlayer();
    return NextResponse.json({
      token: guest.token,
      playerId: guest.player.playerId,
      username: null,
      isGuest: true,
    });
  } catch (err) {
    console.error('[blocks/session]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
