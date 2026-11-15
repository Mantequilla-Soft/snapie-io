// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFeedbackIdentity, readUsableChatSessionToken, submitFeedback } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => btoa(JSON.stringify(v)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

describe('readUsableChatSessionToken', () => {
  const now = Date.UTC(2026, 10, 14);

  it('returns null without a token (Keychain login that never connected chat)', () => {
    expect(readUsableChatSessionToken(now)).toBeNull();
  });

  it('returns null for an expired or malformed token', () => {
    window.localStorage.setItem('hive-chat-token', fakeJwt({ sub: 'alice', exp: now / 1000 - 10 }));
    expect(readUsableChatSessionToken(now)).toBeNull();
    window.localStorage.setItem('hive-chat-token', fakeJwt({ sub: 'alice' }));
    expect(readUsableChatSessionToken(now)).toBeNull();
    window.localStorage.setItem('hive-chat-token', 'not-a-jwt');
    expect(readUsableChatSessionToken(now)).toBeNull();
  });

  it('returns a token that is still valid', () => {
    const token = fakeJwt({ sub: 'alice', exp: now / 1000 + 3600 });
    window.localStorage.setItem('hive-chat-token', token);
    expect(readUsableChatSessionToken(now)).toBe(token);
  });
});

describe('fetchFeedbackIdentity', () => {
  it('sends the chat token and returns the server username', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ hiveUsername: 'alice' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchFeedbackIdentity('chat-jwt')).toBe('alice');
    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer chat-jwt');
  });

  it('returns null for a guest or a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ hiveUsername: null }), { status: 200 })));
    expect(await fetchFeedbackIdentity(null)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchFeedbackIdentity('chat-jwt')).toBeNull();
  });
});

function requestInit(mock: ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>): RequestInit {
  const init = mock.mock.calls[0][1];
  if (!init) throw new Error('expected request init');
  return init;
}

describe('submitFeedback', () => {
  it('sends the form and a chat token, not account identity', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/9',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitFeedback({
      title: 'Hello',
      body: 'A note',
      category: 'idea',
      pageUrl: 'https://snapie.io/settings',
      chatToken: 'chat-jwt',
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/9',
    });
    const init = requestInit(fetchMock);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer chat-jwt');
    expect(JSON.parse(String(init.body))).toEqual({
      title: 'Hello',
      body: 'A note',
      pageUrl: 'https://snapie.io/settings',
      category: 'idea',
    });
  });

  it('omits the auth header for a guest', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ url: null }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await submitFeedback({
      title: 'Hello',
      body: 'A note',
      category: '',
      pageUrl: 'https://snapie.io/',
      chatToken: null,
    });
    const init = requestInit(fetchMock);
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    expect(JSON.parse(String(init.body)).category).toBeUndefined();
  });

  it('returns the server error and a friendly fallback when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: "You've sent several notes recently. Please try again in a little while.",
    }), { status: 429 })));
    const limited = await submitFeedback({
      title: 'Hello',
      body: 'A note',
      category: 'other',
      pageUrl: 'https://snapie.io/',
      chatToken: null,
    });
    expect(limited).toEqual({
      ok: false,
      error: "You've sent several notes recently. Please try again in a little while.",
    });

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const offline = await submitFeedback({
      title: 'Hello',
      body: 'A note',
      category: '',
      pageUrl: 'https://snapie.io/',
      chatToken: null,
    });
    expect(offline).toEqual({ ok: false, error: 'We could not send that. Please try again.' });
  });
});

describe('submitFeedback screenshotUrl', () => {
  it('includes a screenshot URL when provided', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/9',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await submitFeedback({
      title: 'Hello',
      body: 'A note',
      category: '',
      pageUrl: 'https://snapie.io/',
      chatToken: 'chat-jwt',
      screenshotUrl: 'https://images.hive.blog/DQmabc/shot.png',
    });
    expect(JSON.parse(String(requestInit(fetchMock).body)).screenshotUrl).toBe(
      'https://images.hive.blog/DQmabc/shot.png',
    );
  });
});
