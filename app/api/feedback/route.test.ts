import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.CHAT_JWT_SECRET = 'test-secret';
});

import { POST } from './route';
import { resetFeedbackLimitForTests } from '@/lib/feedback/limit';

const TOKEN = 'ghp_feedback_test_token_xyz';
const SECRET = 'test-secret';

function issueResponse() {
  return new Response(JSON.stringify({
    html_url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/42',
    number: 42,
  }), { status: 201, headers: { 'content-type': 'application/json' } });
}

function post(body: unknown, headers: Record<string, string> = {}, ip = '203.0.113.10') {
  return POST(new NextRequest('http://127.0.0.1:3310/api/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': ip,
      'user-agent': 'TestAgent/1.0',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}

beforeEach(() => {
  resetFeedbackLimitForTests();
  process.env.GITHUB_FEEDBACK_TOKEN = TOKEN;
  delete process.env.GITHUB_FEEDBACK_REPO;
  delete process.env.SNAPIE_AUTH_URL;
  vi.stubGlobal('fetch', vi.fn(async () => issueResponse()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function githubBodies(): string[] {
  return vi.mocked(fetch).mock.calls
    .filter((call) => String(call[0]).includes('api.github.com'))
    .map((call) => String(call[1]?.body));
}

describe('POST /api/feedback', () => {
  it('rejects empty, huge, and invalid submissions before calling GitHub', async () => {
    expect((await post({ title: '  ', body: 'hello' })).status).toBe(400);
    expect((await post({ title: 'Hello', body: '   ' })).status).toBe(400);
    expect((await post({ title: 'Hello', body: 'there', category: 'spam' })).status).toBe(400);
    expect((await post({ title: 'a'.repeat(121), body: 'there' })).status).toBe(400);
    expect((await post({ title: 'Hello', body: 'a'.repeat(4001) })).status).toBe(400);
    expect((await post('x'.repeat(16_001))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('files a guest without a client-supplied username, email, ip, or cookie', async () => {
    const res = await post({
      title: 'Hello',
      body: 'A note from the feed.',
      pageUrl: 'https://snapie.io/settings?tab=theme&email=hidden@example.com',
      hiveUsername: 'mallory',
      email: 'hidden@example.com',
      ip: '203.0.113.10',
    }, {
      cookie: 'snapie_other=raw-cookie-value',
      'user-agent': `${'A'.repeat(200)}TAIL`,
    });

    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload).toEqual({ url: 'https://github.com/Mantequilla-Soft/snapie-io/issues/42' });
    expect(JSON.stringify(payload)).not.toContain(TOKEN);

    const sent = githubBodies()[0];
    expect(sent).toContain('[Feedback] Hello');
    expect(sent).toContain('**Hive user:** guest');
    expect(sent).toContain('**Page:** https://snapie.io/settings?tab=theme');
    expect(sent).not.toContain('mallory');
    expect(sent).not.toContain('hidden@example.com');
    expect(sent).not.toContain('203.0.113.10');
    expect(sent).not.toContain('raw-cookie-value');
    expect(sent).not.toContain('TAIL');
    expect(sent).not.toContain(TOKEN);

    const githubHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(githubHeaders.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(githubHeaders.get('cookie')).toBeNull();
  });

  it('puts the chat-session Hive username on the issue', async () => {
    const chatToken = jwt.sign({ sub: 'alice' }, SECRET, { expiresIn: '1h' });
    const res = await post({
      title: 'Broken vote',
      body: 'The button does nothing.',
      category: 'bug',
      pageUrl: 'https://snapie.io/@bob/snaps',
    }, { authorization: `Bearer ${chatToken}` }, '203.0.113.20');

    expect(res.status).toBe(201);
    const sent = githubBodies()[0];
    expect(sent).toContain('[Bug] Broken vote');
    expect(sent).toContain('**Hive user:** alice');
    expect(sent).toContain('"labels":["feedback","bug"]');
    const githubHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(githubHeaders.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(githubHeaders.get('authorization')).not.toContain(chatToken);
  });

  it('prefers the Snapie Auth Hive username and leaves the email off the issue', async () => {
    process.env.SNAPIE_AUTH_URL = 'http://auth.example';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('http://auth.example/')) {
        const cookie = new Headers(init?.headers).get('cookie') ?? '';
        expect(cookie).toContain('snapieauth_session=super-secret-session');
        expect(cookie).not.toContain('unrelated=');
        return new Response(JSON.stringify({
          user: { hiveUsername: 'carol', email: 'carol@example.com' },
        }), { status: 200 });
      }
      return issueResponse();
    }));

    const res = await post({
      title: 'Idea',
      body: 'Let me pin a snap.',
      category: 'idea',
    }, {
      cookie: 'unrelated=do-not-forward; snapieauth_session=super-secret-session',
    }, '203.0.113.30');

    expect(res.status).toBe(201);
    const sent = githubBodies()[0];
    expect(sent).toContain('[Idea] Idea');
    expect(sent).toContain('**Hive user:** carol');
    expect(sent).not.toContain('carol@example.com');
    expect(sent).not.toContain('super-secret-session');
  });

  it('allows five submissions an hour for a key, then rejects', async () => {
    const body = { title: 'Hello', body: 'Again.' };
    for (let i = 0; i < 5; i++) {
      expect((await post(body, {}, '203.0.113.40')).status).toBe(201);
    }
    const blocked = await post(body, {}, '203.0.113.40');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: "You've sent several notes recently. Please try again in a little while.",
    });
    expect(blocked.headers.get('retry-after')).toBe('3600');
    expect(githubBodies()).toHaveLength(5);

    const chatToken = jwt.sign({ sub: 'alice' }, SECRET, { expiresIn: '1h' });
    const signedIn = await post(body, { authorization: `Bearer ${chatToken}` }, '203.0.113.40');
    expect(signedIn.status).toBe(201);
  });

  it('says feedback is unavailable when the token is missing, without using the rate limit', async () => {
    delete process.env.GITHUB_FEEDBACK_TOKEN;
    for (let i = 0; i < 6; i++) {
      const res = await post({ title: 'Hello', body: 'there' }, {}, '203.0.113.50');
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Feedback isn't available right now." });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON', async () => {
    const res = await post('{', {}, '203.0.113.51');
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a friendly error when GitHub fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const res = await post({ title: 'Hello', body: 'there' }, {}, '203.0.113.60');
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.error).toBe("We couldn't send that. Please try again.");
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
  });
});
