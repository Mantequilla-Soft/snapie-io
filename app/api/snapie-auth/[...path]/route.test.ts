import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_BASE = process.env.SNAPIE_AUTH_URL;

async function loadRoute() {
  vi.resetModules();
  process.env.SNAPIE_AUTH_URL = 'http://auth.example';
  return import('./route');
}

function call(
  handler: (req: NextRequest, props: { params: Promise<{ path: string[] }> }) => Promise<Response>,
  path: string[],
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
) {
  const method = init.method ?? 'GET';
  return handler(
    new NextRequest(`http://127.0.0.1:3310/api/snapie-auth/${path.join('/')}`, {
      method,
      headers: init.headers,
      body: method === 'GET' ? undefined : init.body,
    }),
    { params: Promise.resolve({ path }) },
  );
}

afterEach(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.SNAPIE_AUTH_URL;
  else process.env.SNAPIE_AUTH_URL = ORIGINAL_BASE;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('GET /api/snapie-auth/auth/me', () => {
  it('returns a local 401 when there is no session cookie and does not call upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const cookies = [
      undefined,
      'hive_username=alice',
      'snapieauth_csrf=csrf-token',
      'snapieauth_session=',
      'snapieauth_session_backup=not-the-session',
      'other=snapieauth_session=nope',
    ];

    for (const cookie of cookies) {
      const headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.10' };
      if (cookie) headers.cookie = cookie;
      const res = await call(GET, ['auth', 'me'], { headers });
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies auth/me when a session cookie is present', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: { id: '1' } }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'ratelimit-limit': '30',
        'ratelimit-remaining': '29',
        'ratelimit-reset': '900',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const res = await call(GET, ['auth', 'me'], {
      headers: {
        cookie: 'hive_username=alice; snapieauth_session=session-token; snapieauth_csrf=csrf-token',
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: '1' } });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://auth.example/api/auth/me');
    expect(init.method).toBe('GET');
    const forwarded = init.headers as Record<string, string>;
    expect(forwarded.Cookie).toBe('snapieauth_session=session-token; snapieauth_csrf=csrf-token');
    expect(forwarded.Cookie).not.toContain('hive_username');
    expect(forwarded['X-Forwarded-For']).toBe('203.0.113.10, 10.0.0.1');
    expect(res.headers.get('ratelimit-limit')).toBe('30');
    expect(res.headers.get('ratelimit-remaining')).toBe('29');
    expect(res.headers.get('ratelimit-reset')).toBe('900');
  });

  it('passes rate-limit and retry-after headers through on a limited response', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: 'Too many requests, please try again later.' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'RateLimit-Limit': '30',
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': '900',
          RateLimit: '30;w=900',
          'Retry-After': '120',
          'x-request-id': 'do-not-forward',
        },
      },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await loadRoute();

    const res = await call(GET, ['auth', 'me'], {
      headers: { cookie: 'snapieauth_session=session-token' },
    });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests, please try again later.' });
    expect(res.headers.get('ratelimit-limit')).toBe('30');
    expect(res.headers.get('ratelimit-remaining')).toBe('0');
    expect(res.headers.get('ratelimit-reset')).toBe('900');
    expect(res.headers.get('ratelimit')).toBe('30;w=900');
    expect(res.headers.get('retry-after')).toBe('120');
    expect(res.headers.get('x-request-id')).toBeNull();
  });
});

describe('other snapie-auth proxy routes', () => {
  it('still proxies public GETs and login when there is no session cookie', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, url }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET, POST } = await loadRoute();

    const quota = await call(GET, ['quota']);
    expect(quota.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth.example/api/quota');

    const login = await call(POST, ['auth', 'email', 'login'], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'secret' }),
    });
    expect(login.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('http://auth.example/api/auth/email/login');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.c', password: 'secret' }));
  });
});
