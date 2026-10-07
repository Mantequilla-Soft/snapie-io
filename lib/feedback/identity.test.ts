import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.CHAT_JWT_SECRET = 'test-secret';
});

import { resolveFeedbackHiveUsername } from './identity';

const SECRET = 'test-secret';

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SNAPIE_AUTH_URL;
});

describe('resolveFeedbackHiveUsername', () => {
  it('uses a verified chat session username', async () => {
    const token = jwt.sign({ sub: 'Alice' }, SECRET, { expiresIn: '1h' });
    const name = await resolveFeedbackHiveUsername(headers({ authorization: `Bearer ${token}` }));
    expect(name).toBe('alice');
  });

  it('does not treat a warm-up chat id as a Hive username', async () => {
    const token = jwt.sign({ sub: '~abc' }, SECRET, { expiresIn: '1h' });
    const name = await resolveFeedbackHiveUsername(headers({ authorization: `Bearer ${token}` }));
    expect(name).toBeNull();
  });

  it('reads the Hive username from Snapie Auth and ignores email', async () => {
    process.env.SNAPIE_AUTH_URL = 'http://auth.example';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const cookie = new Headers(init?.headers).get('cookie') ?? '';
      expect(cookie).toContain('snapieauth_session=super-secret-session');
      expect(cookie).not.toContain('unrelated=');
      return new Response(JSON.stringify({
        user: { hiveUsername: 'Carol', email: 'carol@example.com' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const name = await resolveFeedbackHiveUsername(headers({
      cookie: 'unrelated=do-not-forward; snapieauth_session=super-secret-session',
    }));
    expect(name).toBe('carol');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('stays a guest when the Hive username is missing or the lookup throws', async () => {
    process.env.SNAPIE_AUTH_URL = 'http://auth.example';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user: { hiveUsername: null, email: 'carol@example.com' },
    }), { status: 200 })));
    expect(await resolveFeedbackHiveUsername(headers({
      cookie: 'snapieauth_session=super-secret-session',
    }))).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    expect(await resolveFeedbackHiveUsername(headers({
      cookie: 'snapieauth_session=super-secret-session',
    }))).toBeNull();
  });

  it('stays a guest when Snapie Auth fails', async () => {
    process.env.SNAPIE_AUTH_URL = 'http://auth.example';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    const name = await resolveFeedbackHiveUsername(headers({
      cookie: 'snapieauth_session=super-secret-session',
    }));
    expect(name).toBeNull();
  });

  it('stays a guest with no session', async () => {
    expect(await resolveFeedbackHiveUsername(headers())).toBeNull();
  });
});
