import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Auth is covered by lib/chat/auth tests; here the handler runs as "alice".
vi.mock('@/lib/chat/auth', () => ({
  withChatAuth: (handler: (req: NextRequest, ctx: { username: string; params: Record<string, string> }) => Promise<NextResponse>) =>
    async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => handler(req, { username: 'alice', params: await ctx.params }),
}));
vi.mock('@/lib/points/config', () => ({
  GAMES_FEATURE_FLAG: true,
  POINTS_FEATURE_FLAG: true,
  passesPointsAllowlist: () => true,
}));

// Single use comes from GameScore's unique (user, game, session) claim, faked here.
const claimed = vi.hoisted(() => new Set<string>());
const submitGameScore = vi.hoisted(() => vi.fn());
vi.mock('@/lib/games/scoreService', () => ({ submitGameScore }));

import { POST as SCORES } from './route';
import { POST as SESSION } from '../session/route';

type Handler = (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
const call = (h: unknown, gameId: string, path: string, body: unknown) =>
  (h as Handler)(
    new NextRequest(`http://localhost/api/games/${gameId}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ gameId }) },
  );

const SESSION_ID = '3b7c8a2e-1f4d-4c1a-9e7b-0a1b2c3d4e5f';
const run = (over: Record<string, unknown> = {}) => ({
  sessionId: SESSION_ID, score: 1_000, stage: 1, stagesCleared: 0, won: false, durationMs: 1_000, endedAt: Date.now(), ...over,
});

async function startRun(gameId = 'snapie-blast', sessionId = SESSION_ID) {
  const res = await call(SESSION, gameId, 'session', { sessionId });
  expect(res.status).toBe(200);
  return ((await res.json()) as { ticket: string }).ticket;
}

beforeEach(() => {
  claimed.clear();
  submitGameScore.mockReset();
  submitGameScore.mockImplementation(async (user: string, game: string, session: string) => {
    const key = `${user}:${game}:${session}`;
    if (claimed.has(key)) return { status: 'duplicate', pointsAwarded: 2, balance: 2 };
    claimed.add(key);
    return { status: 'awarded', pointsAwarded: 2, balance: 2 };
  });
});

describe('POST /api/games/[gameId]/session', () => {
  it('rejects bad session ids and games without client scores', async () => {
    expect((await call(SESSION, 'snapie-blast', 'session', { sessionId: 'x' })).status).toBe(400);
    expect((await call(SESSION, 'snapie-blocks', 'session', { sessionId: SESSION_ID })).status).toBe(404);
    expect((await call(SESSION, 'nope', 'session', { sessionId: SESSION_ID })).status).toBe(404);
  });
});

describe('POST /api/games/[gameId]/scores with tickets', () => {
  it('saves a score with a valid ticket, once', async () => {
    const ticket = await startRun();
    const first = await call(SCORES, 'snapie-blast', 'scores', run({ ticket }));
    expect(await first.json()).toMatchObject({ status: 'awarded' });
    const replay = await call(SCORES, 'snapie-blast', 'scores', run({ ticket }));
    expect(await replay.json()).toMatchObject({ status: 'duplicate' });
    expect(submitGameScore).toHaveBeenCalledTimes(2);
  });

  it('refuses a score without a ticket', async () => {
    const res = await call(SCORES, 'snapie-blast', 'scores', run());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'invalid_ticket', reason: 'missing' });
    expect(submitGameScore).not.toHaveBeenCalled();
  });

  it('refuses a ticket from another game or session', async () => {
    const rushTicket = await startRun('snapie-rush');
    expect(await (await call(SCORES, 'snapie-blast', 'scores', run({ ticket: rushTicket }))).json()).toMatchObject({ reason: 'wrong_game' });
    const other = await startRun('snapie-blast', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(await (await call(SCORES, 'snapie-blast', 'scores', run({ ticket: other }))).json()).toMatchObject({ reason: 'wrong_session' });
    expect(submitGameScore).not.toHaveBeenCalled();
  });

  it('refuses a score too high for the time since the ticket', async () => {
    const ticket = await startRun();
    const res = await call(SCORES, 'snapie-blast', 'scores', run({ ticket, score: 45_000 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: 'score_rate' });
  });

  it('refuses a run that claims to be longer than its ticket', async () => {
    const ticket = await startRun();
    const res = await call(SCORES, 'snapie-blast', 'scores', run({ ticket, durationMs: 10 * 60_000 }));
    expect(await res.json()).toMatchObject({ reason: 'duration_exceeds_ticket' });
  });

  it('leaves flat-win games to the score service, which rejects them', async () => {
    submitGameScore.mockResolvedValueOnce({ status: 'invalid_score', pointsAwarded: 0, balance: 0 });
    const res = await call(SCORES, 'snapie-blocks', 'scores', run());
    expect(await res.json()).toMatchObject({ status: 'invalid_score' });
  });

  it('fails closed in production without GAME_TICKET_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GAME_TICKET_SECRET', '');
    try {
      expect((await call(SESSION, 'snapie-blast', 'session', { sessionId: SESSION_ID })).status).toBe(503);
      expect((await call(SCORES, 'snapie-blast', 'scores', run({ ticket: 'a.b' }))).status).toBe(503);
      expect(submitGameScore).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
