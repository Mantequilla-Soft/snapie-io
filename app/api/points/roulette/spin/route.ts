import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { ROULETTE_FEATURE_FLAG, passesPointsAllowlist } from '@/lib/points/config';
import { spinRoulette } from '@/lib/points/rouletteService';

export const POST = withChatAuth(async (req, { username }) => {
  // Authoritative eligibility — the client flag is never trusted. Roulette's
  // own rollout switch, layered on top of the base points dogfood allowlist
  // (same gate the award route uses; see lib/points/config.ts).
  if (!ROULETTE_FEATURE_FLAG || !passesPointsAllowlist(username)) {
    return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
  }

  let body: { spinId?: unknown; stake?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { spinId, stake } = body;
  if (typeof spinId !== 'string' || !spinId || typeof stake !== 'number' || !Number.isFinite(stake)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const result = await spinRoulette(username, spinId, stake);
  return NextResponse.json(result);
});
