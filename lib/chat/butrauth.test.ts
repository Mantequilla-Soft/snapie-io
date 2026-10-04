import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.CHAT_JWT_SECRET = 'test-secret';
});

const findById = vi.fn();
const updateOne = vi.fn();
const mergeWarmupIdentity = vi.fn();

vi.mock('@/lib/db/mongodb', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/models/ChatUser', () => ({
  ChatUser: {
    findById: (...a: unknown[]) => ({ lean: () => findById(...a) }),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));
vi.mock('@/lib/chat/graduation', () => ({
  mergeWarmupIdentity: (...a: unknown[]) => mergeWarmupIdentity(...a),
}));
vi.mock('@/lib/hive/hiveclient', () => ({ default: { database: { getAccounts: vi.fn() } } }));

import {
  chatIdForClaims,
  butrauthConfig,
  getButrauthVerifier,
  resetButrauthVerifierForTests,
} from '@/lib/chat/butrauth';
import { verifyChatJWT } from '@/lib/chat/auth';
import { POST } from '@/app/api/chat/auth/butrauth/route';

const UID = '6abac678918cf1caeeb19ecc';

function claims(over: Record<string, unknown> = {}) {
  return { userId: UID, hiveUsername: null, incubation: true, handle: 'newbie', clientId: 'app', ...over };
}

function req(body: unknown) {
  return new NextRequest('https://snapie.example/api/chat/auth/butrauth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
  });
}

describe('chatIdForClaims', () => {
  it('signs a Hive user in as their Hive name', () => {
    expect(chatIdForClaims(claims({ hiveUsername: 'Alice', incubation: false }))).toBe('alice');
  });

  it('signs a warm-up user in as ~userId, never as the handle', () => {
    expect(chatIdForClaims(claims())).toBe(`~${UID}`);
  });

  it('refuses ids that could break a DM id or impersonate', () => {
    expect(chatIdForClaims(claims({ userId: 'a:b' }))).toBeNull();
    expect(chatIdForClaims(claims({ userId: '' }))).toBeNull();
    expect(chatIdForClaims(claims({ hiveUsername: 'bad:name' }))).toBeNull();
    expect(chatIdForClaims(claims({ hiveUsername: '~x' }))).toBeNull();
  });
});

describe('butrauthConfig / getButrauthVerifier', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetButrauthVerifierForTests();
  });

  it('is off unless both URL and audiences are set', async () => {
    delete process.env.BUTRAUTH_URL;
    process.env.BUTRAUTH_CHAT_AUDIENCES = 'a';
    expect(butrauthConfig()).toBeNull();
    resetButrauthVerifierForTests();
    expect(await getButrauthVerifier()).toBeNull();
  });

  it('parses a comma-separated audience list', () => {
    process.env.BUTRAUTH_URL = 'https://butrauth.com';
    process.env.BUTRAUTH_CHAT_AUDIENCES = ' a , b,,';
    expect(butrauthConfig()).toEqual({ baseUrl: 'https://butrauth.com', audiences: ['a', 'b'], issuer: 'butrauth' });
  });
});

describe('POST /api/chat/auth/butrauth', () => {
  const verifyAccessToken = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    resetButrauthVerifierForTests({ verifyAccessToken });
    findById.mockResolvedValue(null);
    updateOne.mockResolvedValue({});
    mergeWarmupIdentity.mockResolvedValue({ merged: false, conversations: 0 });
  });

  afterEach(() => resetButrauthVerifierForTests());

  it('answers 404 when ButrAuth sign-in is not configured', async () => {
    resetButrauthVerifierForTests(null);
    const res = await POST(req({ accessToken: 'x' }));
    expect(res.status).toBe(404);
  });

  it('gives a warm-up user a chat token for ~userId and stores the handle as display name', async () => {
    verifyAccessToken.mockResolvedValue(claims());
    const res = await POST(req({ accessToken: 'tok' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ username: `~${UID}`, displayName: 'newbie', warmup: true });
    expect(verifyChatJWT(body.token)?.sub).toBe(`~${UID}`);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: `~${UID}` },
      expect.objectContaining({ $set: expect.objectContaining({ displayName: 'newbie', butrauthUserId: UID }) }),
      { upsert: true }
    );
    expect(mergeWarmupIdentity).not.toHaveBeenCalled();
  });

  it('signs a graduated user in as their Hive name and merges the warm-up history', async () => {
    verifyAccessToken.mockResolvedValue(claims({ hiveUsername: 'newbie', incubation: false }));
    const res = await POST(req({ accessToken: 'tok' }));
    expect(res.status).toBe(200);
    expect((await res.json()).username).toBe('newbie');
    expect(mergeWarmupIdentity).toHaveBeenCalledWith(`~${UID}`, 'newbie');
  });

  it('sends a stale warm-up token back with 409 once the identity has graduated', async () => {
    verifyAccessToken.mockResolvedValue(claims());
    findById.mockResolvedValue({ mergedInto: 'newbie' });
    const res = await POST(req({ accessToken: 'tok' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'graduated', username: 'newbie' });
  });

  it('refuses a token the verifier rejects (wrong app, expired, forged)', async () => {
    verifyAccessToken.mockRejectedValue(new Error('Token issued for a different client'));
    const res = await POST(req({ accessToken: 'tok' }));
    expect(res.status).toBe(401);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('requires an access token', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
