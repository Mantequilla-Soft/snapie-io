import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.SNAPIE_AUTH_URL = 'http://auth.test.invalid';
});

import { GET } from './[...path]/route';

const fetchMock = vi.fn();

function meRequest(cookie?: string) {
  return new NextRequest('http://localhost/api/snapie-auth/auth/me', {
    headers: cookie ? { cookie } : {},
  });
}

describe('GET /api/snapie-auth/auth/me', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers 200 authenticated:false when no session cookie is present and does not call upstream', async () => {
    const res = await GET(meRequest(), { params: { path: ['auth', 'me'] } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an empty session cookie as logged out', async () => {
    const res = await GET(meRequest('snapieauth_session='), { params: { path: ['auth', 'me'] } });

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies when the session cookie is present, including an upstream 401', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET(
      meRequest('snapieauth_session=jwt; other=nope; snapieauth_csrf=csrf'),
      { params: { path: ['auth', 'me'] } },
    );

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth.test.invalid/api/auth/me');
    expect(init.headers.Cookie).toBe('snapieauth_session=jwt; snapieauth_csrf=csrf');
    expect(init.headers.Cookie).not.toContain('other=');
  });

  it('still proxies other paths when logged out', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ remaining: 3 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET(
      new NextRequest('http://localhost/api/snapie-auth/quota'),
      { params: { path: ['quota'] } },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://auth.test.invalid/api/quota');
  });
});
