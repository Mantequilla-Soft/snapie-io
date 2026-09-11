import { NextResponse } from 'next/server';
import { withChatAuth } from '@/lib/chat/auth';
import { GAMES_FEATURE_FLAG, POINTS_FEATURE_FLAG, passesPointsAllowlist } from '@/lib/points/config';
import { submitGameScore } from '@/lib/games/scoreService';

export const POST = withChatAuth(async (req, { username, params }) => {
  try {
    const gameId = params?.gameId;
    if (!gameId) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    // Authoritative eligibility — the client flags are never trusted. Games' own
    // rollout switch, layered on top of the base points dogfood allowlist
    // (same gate the award route uses; see lib/points/config.ts).
    if (!GAMES_FEATURE_FLAG || !POINTS_FEATURE_FLAG || !passesPointsAllowlist(username)) {
      return NextResponse.json({ error: 'not_enrolled' }, { status: 403 });
    }

    let body: {
      sessionId?: unknown;
      score?: unknown;
      stage?: unknown;
      stagesCleared?: unknown;
      won?: unknown;
      durationMs?: unknown;
      endedAt?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const { sessionId, score, stage, stagesCleared, won, durationMs, endedAt } = body;

    if (
      typeof sessionId !== 'string' ||
      !sessionId ||
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      typeof stage !== 'number' ||
      !Number.isFinite(stage) ||
      typeof stagesCleared !== 'number' ||
      !Number.isFinite(stagesCleared) ||
      typeof won !== 'boolean' ||
      typeof durationMs !== 'number' ||
      !Number.isFinite(durationMs) ||
      typeof endedAt !== 'number' ||
      !Number.isFinite(endedAt)
    ) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const result = await submitGameScore(
      username,
      gameId,
      sessionId,
      score,
      stage,
      stagesCleared,
      won,
      durationMs,
      endedAt,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('[games/scores] Error:', err);
    return NextResponse.json(
      { error: 'internal_error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
});
