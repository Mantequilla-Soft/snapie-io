import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const jwtVerify = vi.fn();
const connectDB = vi.fn();
const findOneAndUpdate = vi.fn();

vi.mock('jsonwebtoken', () => ({
  default: { verify: (...args: unknown[]) => jwtVerify(...args) },
}));

vi.mock('@/lib/db/mongodb', () => ({
  connectDB: (...args: unknown[]) => connectDB(...args),
}));

vi.mock('@/lib/db/models/ChatUser', () => ({
  ChatUser: { findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args) },
}));

vi.mock('@/lib/hive/hiveclient', () => ({
  default: { database: { getAccounts: vi.fn() } },
}));

process.env.CHAT_JWT_SECRET = 'test-secret';

import { withChatAuth } from '@/lib/chat/auth';

const USERNAME = 'alice';

function authedReq(): NextRequest {
  return new NextRequest('https://snapie.example/api/x', {
    headers: { Authorization: 'Bearer token' },
  });
}

function dynamicServerError(): Error {
  return Object.assign(new Error("Dynamic server usage: route used `request.headers`"), {
    digest: 'DYNAMIC_SERVER_USAGE',
    description: "Route /api/x couldn't be rendered statically because it used `request.headers`.",
  });
}

/** Invoke the wrapped handler with a valid token, returning handler's result. */
async function run(handler: Parameters<typeof withChatAuth>[0], req?: NextRequest) {
  jwtVerify.mockReturnValue({ sub: USERNAME });
  const wrapped = withChatAuth(handler);
  return wrapped(req ?? authedReq(), { params: { id: '1' } });
}

beforeEach(() => {
  vi.resetAllMocks();
  connectDB.mockResolvedValue(undefined);
  findOneAndUpdate.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withChatAuth', () => {
  it('returns handler response for a valid JWT', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const res = await run(handler);
    expect(res.status).toBe(200);
    expect(connectDB).toHaveBeenCalledOnce();
    expect(findOneAndUpdate).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      { username: USERNAME, params: { id: '1' } }
    );
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const res = await run(handler, new NextRequest('https://snapie.example/api/x'));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when the header is not a Bearer token', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const req = new NextRequest('https://snapie.example/api/x', {
      headers: { Authorization: 'Basic abc' },
    });
    const res = await run(handler, req);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid or expired JWT', async () => {
    jwtVerify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const res = await withChatAuth(handler)(authedReq());
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 500 and logs when the handler throws an ordinary error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await run(async () => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'internal_error', message: 'boom' });
    expect(logged).toHaveBeenCalledOnce();
  });

  it('returns 500 and logs for errors with a different digest', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('boom'), { digest: 'SOMETHING_ELSE' });
    const res = await run(async () => {
      throw err;
    });
    expect(res.status).toBe(500);
    expect(logged).toHaveBeenCalledOnce();
  });

  it('returns 500 and logs for non-object throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const thrown of [null, 'string error', 42]) {
      const res = await run(async () => {
        throw thrown;
      });
      expect(res.status).toBe(500);
    }
    expect(logged).toHaveBeenCalledTimes(3);
  });

  describe('DYNAMIC_SERVER_USAGE', () => {
    it("re-throws Next's signal instead of converting it to a 500", async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const signal = dynamicServerError();
      await expect(
        run(async () => {
          throw signal;
        })
      ).rejects.toBe(signal);
      expect(logged).not.toHaveBeenCalled();
    });

    it('does not re-throw a prefixed Next 15 style digest (exact match only)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const err = Object.assign(new Error('dynamic'), {
        digest: 'DYNAMIC_SERVER_USAGE:/api/x',
      });
      const res = await run(async () => {
        throw err;
      });
      expect(res.status).toBe(500);
    });

    it('re-throws a redirect() control-flow error from an async handler', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const signal = Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;https://snapie.example/login;307',
      });
      await expect(
        run(async () => {
          throw signal;
        })
      ).rejects.toBe(signal);
      expect(logged).not.toHaveBeenCalled();
    });

    it('re-throws a notFound() control-flow error from an async handler', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const signal = Object.assign(new Error('NEXT_NOT_FOUND'), {
        digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
      });
      await expect(
        run(async () => {
          throw signal;
        })
      ).rejects.toBe(signal);
      expect(logged).not.toHaveBeenCalled();
    });
  });
});
