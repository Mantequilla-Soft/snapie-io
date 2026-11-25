import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { GAMES_FEATURE_FLAG, POINTS_FEATURE_FLAG, passesPointsAllowlist } from '@/lib/points/config';
import { GAME_AWARD_MODE, GAME_IDS, type GameId } from '@/lib/games/config';
import { TicketSecretMissingError, isValidSessionId, issueTicket } from '@/lib/games/sessionTicket';

/**
 * Starts a scored run: returns a signed ticket for { game, user, sessionId,
 * now }. The scores route requires it (see lib/games/sessionTicket.ts).
 * Snapie Blocks has its own /api/games/snapie-blocks/session; that static
 * route wins over this one.
 */
export const POST = withChatAuth(async (req, { username, params }) => {
  const gameId = params?.gameId;
  if (!gameId || !GAME_IDS.includes(gameId as GameId) || GAME_AWARD_MODE[gameId as GameId] !== 'score') {
    return NextResponse.json({ error: 'unknown_game' }, { status: 404 });
  }
  if (!GAMES_FEATURE_FLAG || !POINTS_FEATURE_FLAG || !passesPointsAllowlist(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  let body: { sessionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!isValidSessionId(body.sessionId)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    const ticket = issueTicket({ gameId: gameId as GameId, username, sessionId: body.sessionId });
    return NextResponse.json({ ticket });
  } catch (err) {
    if (err instanceof TicketSecretMissingError) {
      console.error('[games/session]', err.message);
      return NextResponse.json({ error: 'tickets_unavailable' }, { status: 503 });
    }
    throw err;
  }
});
