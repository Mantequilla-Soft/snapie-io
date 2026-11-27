import { describe, expect, it, vi } from 'vitest';
import {
  GAME_TICKET_SECRET_ENV,
  TICKET_MAX_AGE_MS,
  TicketSecretMissingError,
  isValidSessionId,
  issueTicket,
  ticketSecret,
  verifyTicket,
} from './sessionTicket';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const T0 = 1_800_000_000_000;
const base = { gameId: 'snapie-blast' as const, username: 'alice', sessionId: 'session-abc-123' };
const ticket = (over: Partial<typeof base & { now: number }> = {}) => issueTicket({ ...base, now: T0, ...over }, SECRET);
const check = (t: unknown, over: Partial<{ score: number; durationMs: number; now: number; gameId: 'snapie-blast' | 'snapie-rush'; username: string; sessionId: string }> = {}) =>
  verifyTicket(t, { ...base, score: 1_000, durationMs: 30_000, now: T0 + 60_000, ...over }, SECRET);

describe('game session tickets', () => {
  it('accepts a genuine ticket for a plausible run', () => {
    const res = check(ticket());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toMatchObject({ g: 'snapie-blast', u: 'alice', s: 'session-abc-123', iat: T0 });
  });

  it('gives every ticket its own nonce', () => {
    expect(ticket()).not.toBe(ticket());
  });

  it('rejects a missing, malformed or tampered ticket', () => {
    expect(check(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(check('nodot')).toEqual({ ok: false, reason: 'malformed' });
    const [body, sig] = ticket().split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), iat: T0 - 3_600_000 })).toString('base64url');
    expect(check(`${forged}.${sig}`)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(check(`${body}.${sig.slice(0, -2)}AA`)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a ticket signed with another key', () => {
    const other = issueTicket({ ...base, now: T0 }, 'another-secret-that-is-also-32-characters!!');
    expect(check(other)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('binds the ticket to its game, user and session', () => {
    expect(check(ticket(), { gameId: 'snapie-rush' })).toEqual({ ok: false, reason: 'wrong_game' });
    expect(check(ticket(), { username: 'mallory' })).toEqual({ ok: false, reason: 'wrong_user' });
    expect(check(ticket(), { sessionId: 'session-other-1' })).toEqual({ ok: false, reason: 'wrong_session' });
  });

  it('rejects an expired or future-dated ticket', () => {
    expect(check(ticket(), { now: T0 + TICKET_MAX_AGE_MS + 1 })).toEqual({ ok: false, reason: 'expired' });
    expect(check(ticket({ now: T0 + 60_000 }), { now: T0 })).toEqual({ ok: false, reason: 'not_yet_valid' });
  });

  it('rejects a run longer than the time since the ticket', () => {
    expect(check(ticket(), { durationMs: 5 * 60_000, now: T0 + 60_000 })).toEqual({ ok: false, reason: 'duration_exceeds_ticket' });
  });

  it('rejects a score no run could reach in the elapsed time', () => {
    // Blast: 5,000 burst + 2,000/s. One minute allows 125,000, so 50,000 passes.
    expect(check(ticket(), { score: 50_000, now: T0 + 60_000 }).ok).toBe(true);
    // Two seconds after the ticket: at most 9,000.
    expect(check(ticket(), { score: 40_000, durationMs: 1_000, now: T0 + 2_000 })).toEqual({ ok: false, reason: 'score_rate' });
  });

  it('validates session ids', () => {
    expect(isValidSessionId(crypto.randomUUID())).toBe(true);
    expect(isValidSessionId('short')).toBe(false);
    expect(isValidSessionId('has spaces in it')).toBe(false);
    expect(isValidSessionId(42)).toBe(false);
  });
});

describe('ticket secret', () => {
  it('uses GAME_TICKET_SECRET when it is long enough', () => {
    expect(ticketSecret({ [GAME_TICKET_SECRET_ENV]: SECRET, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(SECRET);
  });

  it('fails closed in production when the secret is missing or short', () => {
    expect(() => ticketSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(TicketSecretMissingError);
    expect(() => ticketSecret({ NODE_ENV: 'production', [GAME_TICKET_SECRET_ENV]: 'short' } as NodeJS.ProcessEnv)).toThrow(TicketSecretMissingError);
  });

  it('falls back to a dev-only key outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = ticketSecret({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(key).toMatch(/dev-only/);
    expect(ticketSecret({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(key);
    warn.mockRestore();
  });
});
