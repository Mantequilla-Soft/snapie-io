import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GAME_MAX_SCORE_PER_SECOND, GAME_SCORE_BURST, type GameId } from '@/lib/games/config';

/**
 * Signed game session tickets (#169).
 *
 * When a run starts, the server signs { game, user, session, issued-at, nonce }
 * with HMAC-SHA256. Saving the score requires that ticket, so the server, not
 * the browser, knows when the run began. That stops replays of old runs and
 * scores for sessions the server never saw, and it bounds a score by the real
 * time since the run started. A ticket is bound to one sessionId, and GameScore
 * already claims a sessionId once, so a ticket can credit points at most once.
 *
 * It does not stop a forged score inside the plausible range; replay
 * validation of the input log is the follow-up for that.
 *
 * Secret: GAME_TICKET_SECRET (32+ characters). Production fails closed
 * without it; development and tests fall back to a fixed, obviously-fake key.
 */

export const GAME_TICKET_SECRET_ENV = 'GAME_TICKET_SECRET';
const DEV_FALLBACK_SECRET = 'snapie-dev-only-game-ticket-secret-not-for-production';
const MIN_SECRET_LENGTH = 32;

/** A ticket older than this can't save a score. Longer than any real run. */
export const TICKET_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Clock and network slack between the ticket request and the game's own timer. */
export const TICKET_CLOCK_SLACK_MS = 10_000;

const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const TICKET_VERSION = 1;

export interface TicketPayload {
  v: number;
  g: GameId;
  u: string;
  s: string;
  iat: number;
  n: string;
}

export class TicketSecretMissingError extends Error {
  constructor() {
    super(`${GAME_TICKET_SECRET_ENV} is not set (or shorter than ${MIN_SECRET_LENGTH} characters)`);
    this.name = 'TicketSecretMissingError';
  }
}

let warnedFallback = false;

/** The signing key. Throws TicketSecretMissingError in production when unset. */
export function ticketSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env[GAME_TICKET_SECRET_ENV];
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (env.NODE_ENV === 'production') throw new TicketSecretMissingError();
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(`[games] ${GAME_TICKET_SECRET_ENV} not set; using the development-only ticket key`);
  }
  return DEV_FALLBACK_SECRET;
}

export function isValidSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId);
}

const b64url = (buf: Buffer) => buf.toString('base64url');
const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest();

export function issueTicket(
  input: { gameId: GameId; username: string; sessionId: string; now?: number },
  secret: string = ticketSecret(),
): string {
  const payload: TicketPayload = {
    v: TICKET_VERSION,
    g: input.gameId,
    u: input.username,
    s: input.sessionId,
    iat: input.now ?? Date.now(),
    n: b64url(randomBytes(12)),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64url(sign(body, secret))}`;
}

export type TicketRejection =
  | 'missing'
  | 'malformed'
  | 'bad_signature'
  | 'wrong_game'
  | 'wrong_user'
  | 'wrong_session'
  | 'not_yet_valid'
  | 'expired'
  | 'duration_exceeds_ticket'
  | 'score_rate';

export type TicketCheck = { ok: true; payload: TicketPayload } | { ok: false; reason: TicketRejection };

/**
 * Checks the signature and the binding, then whether the claimed run fits in
 * the time since the ticket was issued:
 * - durationMs can't exceed the ticket's age (plus slack);
 * - score can't exceed GAME_SCORE_BURST + rate x seconds since the ticket.
 */
export function verifyTicket(
  ticket: unknown,
  expected: { gameId: GameId; username: string; sessionId: string; score: number; durationMs: number; now?: number },
  secret: string = ticketSecret(),
): TicketCheck {
  if (typeof ticket !== 'string' || !ticket) return { ok: false, reason: 'missing' };
  const parts = ticket.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;

  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const want = sign(body, secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false, reason: 'bad_signature' };

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    !payload || payload.v !== TICKET_VERSION || typeof payload.iat !== 'number' ||
    typeof payload.g !== 'string' || typeof payload.u !== 'string' || typeof payload.s !== 'string'
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (payload.g !== expected.gameId) return { ok: false, reason: 'wrong_game' };
  if (payload.u !== expected.username) return { ok: false, reason: 'wrong_user' };
  if (payload.s !== expected.sessionId) return { ok: false, reason: 'wrong_session' };

  const now = expected.now ?? Date.now();
  const age = now - payload.iat;
  if (age < -TICKET_CLOCK_SLACK_MS) return { ok: false, reason: 'not_yet_valid' };
  if (age > TICKET_MAX_AGE_MS) return { ok: false, reason: 'expired' };
  if (expected.durationMs > Math.max(age, 0) + TICKET_CLOCK_SLACK_MS) {
    return { ok: false, reason: 'duration_exceeds_ticket' };
  }

  const seconds = Math.max(age, 0) / 1000;
  const maxScore = GAME_SCORE_BURST[expected.gameId] + GAME_MAX_SCORE_PER_SECOND[expected.gameId] * seconds;
  if (expected.score > maxScore) return { ok: false, reason: 'score_rate' };

  return { ok: true, payload };
}
