import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitFeedback } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
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
