import { NextRequest, NextResponse } from 'next/server';
import { matchAction, type ClientMatchAction } from '@/lib/games/blocks/matchService';
import { guardBlocks } from '@/lib/games/blocks/routeGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseAction(body: unknown): ClientMatchAction | null {
  if (!body || typeof body !== 'object') return null;
  const rec = body as Record<string, unknown>;
  if (rec.type === 'poll') {
    const ack = Array.isArray(rec.ack)
      ? rec.ack.filter((id): id is string => typeof id === 'string').slice(0, 40)
      : undefined;
    return { type: 'poll', ack };
  }
  if (rec.type === 'ko' || rec.type === 'forfeit') return { type: rec.type };
  if (rec.type === 'attack') {
    if (typeof rec.lines !== 'number' || typeof rec.eventId !== 'string') return null;
    return { type: 'attack', lines: rec.lines, eventId: rec.eventId };
  }
  // No "I won" action. The server finishes the match from a KO, forfeit, or disconnect.
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ matchId: string }> }) {
  try {
    const gate = guardBlocks(req);
    if ('response' in gate) return gate.response;
    const matchId = (await ctx.params).matchId;
    if (!/^[a-f0-9]{24}$/i.test(matchId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const action = parseAction(body);
    if (!action) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const result = await matchAction(gate.player, matchId, action);
    if ('error' in result) {
      const status = result.error === 'forbidden' ? 403 : 404;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[blocks/match]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
