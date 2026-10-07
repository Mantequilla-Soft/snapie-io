import { NextResponse } from 'next/server';
import { checkRateLimit, trustedClientIp, type RateLimitEntry } from '@/lib/http/rateLimit';
import { GAMES_FEATURE_FLAG } from '@/lib/points/config';
import { readBlocksPlayerFromRequest, type BlocksPlayerIdentity } from '@/lib/games/blocks/auth';

const buckets = new Map<string, RateLimitEntry>();

export function gamesDisabledResponse(): NextResponse | null {
  if (GAMES_FEATURE_FLAG) return null;
  return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
}

export function guardBlocks(
  req: { headers: { get(name: string): string | null } },
  limit = 80,
): { player: BlocksPlayerIdentity } | { response: NextResponse } {
  const disabled = gamesDisabledResponse();
  if (disabled) return { response: disabled };
  const player = readBlocksPlayerFromRequest(req);
  if (!player) return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!checkRateLimit(buckets, player.playerId, limit, 10_000)) {
    return { response: NextResponse.json({ error: 'rate_limited' }, { status: 429 }) };
  }
  return { player };
}

const sessionBuckets = new Map<string, RateLimitEntry>();

export function guardSessionMint(req: { headers: Headers }): NextResponse | null {
  const disabled = gamesDisabledResponse();
  if (disabled) return disabled;
  const ip = trustedClientIp(req.headers);
  if (!checkRateLimit(sessionBuckets, `session:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  return null;
}
