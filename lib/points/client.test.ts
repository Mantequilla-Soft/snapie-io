// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION_TOKEN_KEY = 'hive-chat-token';

function makeJwt(expSecondsFromNow: number | null): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = expSecondsFromNow === null
        ? {}
        : { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };
    return `${header}.${btoa(JSON.stringify(payload))}.fakesignature`;
}

const authenticateMock = vi.fn();
vi.mock('@/lib/chat/ChatService', () => ({
    chatService: {
        authenticate: (...args: unknown[]) => authenticateMock(...args),
    },
}));

vi.mock('@/lib/hive/aioha', () => ({
    signMessageWithAioha: vi.fn(async () => ({ success: true, result: 'signature' })),
    KeyTypes: { Posting: 'posting' },
}));

vi.mock('@/lib/points/config', () => ({
    isPointsEnabledFor: () => true,
}));

const fetchMock = vi.fn();

beforeEach(() => {
    localStorage.clear();
    authenticateMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('ensureSessionToken', () => {
    it('returns a cached, still-valid token without minting a new one', async () => {
        localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600));
        const { ensureSessionToken } = await import('./client');
        const token = await ensureSessionToken('meno');
        expect(token).toBe(localStorage.getItem(SESSION_TOKEN_KEY));
        expect(authenticateMock).not.toHaveBeenCalled();
    });

    it('treats an expired cached token as absent and mints a fresh one', async () => {
        localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(-10)); // expired 10s ago
        authenticateMock.mockImplementation(async () => {
            localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600));
        });
        const { ensureSessionToken } = await import('./client');
        const token = await ensureSessionToken('meno');
        expect(authenticateMock).toHaveBeenCalledTimes(1);
        expect(token).toBe(localStorage.getItem(SESSION_TOKEN_KEY));
    });

    it('trusts a cached token it cannot parse as a JWT (fail-open — the server verifies for real)', async () => {
        localStorage.setItem(SESSION_TOKEN_KEY, 'not-a-real-jwt');
        const { ensureSessionToken } = await import('./client');
        const token = await ensureSessionToken('meno');
        expect(token).toBe('not-a-real-jwt');
        expect(authenticateMock).not.toHaveBeenCalled();
    });

    it('mints a token when none is cached', async () => {
        authenticateMock.mockImplementation(async () => {
            localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600));
        });
        const { ensureSessionToken } = await import('./client');
        const token = await ensureSessionToken('meno');
        expect(authenticateMock).toHaveBeenCalledTimes(1);
        expect(token).not.toBeNull();
    });
});

describe('authenticatedFetch', () => {
    it('returns the response on a normal successful call', async () => {
        localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600));
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        const { authenticatedFetch } = await import('./client');
        const res = await authenticatedFetch('meno', '/api/points/award', { method: 'POST' });
        expect(res?.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('clears the token, re-mints, and retries once on a 401 despite a client-side-valid token', async () => {
        localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600)); // looks valid client-side
        authenticateMock.mockImplementation(async () => {
            localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600));
        });
        fetchMock
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));

        const { authenticatedFetch } = await import('./client');
        const res = await authenticatedFetch('meno', '/api/points/award', { method: 'POST' });

        expect(res?.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(authenticateMock).toHaveBeenCalledTimes(1); // re-minted once after the 401
    });

    it('returns null when no token can be obtained at all (e.g. signature declined)', async () => {
        authenticateMock.mockRejectedValue(new Error('declined'));
        const { authenticatedFetch } = await import('./client');
        const res = await authenticatedFetch('meno', '/api/points/award', { method: 'POST' });
        expect(res).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('gives up and returns the 401 response if re-minting after the retry also fails', async () => {
        localStorage.setItem(SESSION_TOKEN_KEY, makeJwt(3600));
        authenticateMock.mockRejectedValue(new Error('declined'));
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

        const { authenticatedFetch } = await import('./client');
        const res = await authenticatedFetch('meno', '/api/points/award', { method: 'POST' });

        expect(res?.status).toBe(401);
        expect(fetchMock).toHaveBeenCalledTimes(1); // no retry attempted, no fresh token available
    });
});
