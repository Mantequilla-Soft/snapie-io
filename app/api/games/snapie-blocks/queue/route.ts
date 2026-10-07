import { NextRequest, NextResponse } from 'next/server';
import { leaveQueue, queueTick } from '@/lib/games/blocks/matchService';
import { guardBlocks } from '@/lib/games/blocks/routeGuard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const gate = guardBlocks(req);
    if ('response' in gate) return gate.response;

    let action: 'tick' | 'cancel' = 'tick';
    try {
      const body = (await req.json()) as { action?: unknown };
      if (body?.action === 'cancel') action = 'cancel';
      else if (body?.action != null && body.action !== 'tick') {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const view = action === 'cancel' ? await leaveQueue(gate.player) : await queueTick(gate.player);
    return NextResponse.json(view);
  } catch (err) {
    console.error('[blocks/queue]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
