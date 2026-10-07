import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { probeFeedImageHead } from './feedLcpProbe';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

vi.mock('node:http', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

vi.mock('node:https', () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

type HeadResult = {
  status?: number;
  headers?: Record<string, string | string[] | undefined>;
  error?: Error;
};

const lookups: Array<{
  hostname: string;
  options: unknown;
  callback?: (...args: unknown[]) => void;
}> = [];

function installHead(request: ReturnType<typeof vi.fn>, result: HeadResult | ((url: URL) => HeadResult)) {
  request.mockImplementation((target: URL, options: { lookup?: (...args: unknown[]) => void }, cb: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    lookups.push({ hostname: target.hostname, options: options.lookup });
    req.end = () => {
      const resolved = typeof result === 'function' ? result(target) : result;
      if (resolved.error) {
        req.emit('error', resolved.error);
        return;
      }
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string | string[] | undefined>;
        resume: () => void;
      };
      res.statusCode = resolved.status ?? 200;
      res.headers = resolved.headers ?? {};
      res.resume = vi.fn();
      cb(res);
    };
    return req;
  });
}

beforeEach(() => {
  lookups.length = 0;
  vi.mocked(lookup).mockReset();
  vi.mocked(http.request).mockReset();
  vi.mocked(https.request).mockReset();
  vi.mocked(lookup).mockResolvedValue([{ address: '1.1.1.1', family: 4 }] as never);
});

describe('probeFeedImageHead', () => {
  it('does not request a blocked host', async () => {
    await expect(probeFeedImageHead('http://127.0.0.1/secret.jpg')).resolves.toBeNull();
    await expect(probeFeedImageHead('http://localhost/a.png')).resolves.toBeNull();
    await expect(probeFeedImageHead('http://169.254.169.254/latest/meta-data')).resolves.toBeNull();
    await expect(probeFeedImageHead('not a url')).resolves.toBeNull();
    expect(http.request).not.toHaveBeenCalled();
  });

  it('returns content type and length from a pinned HEAD', async () => {
    installHead(http.request as never, {
      status: 200,
      headers: { 'content-type': 'image/jpeg; charset=binary', 'content-length': '1200' },
    });
    await expect(probeFeedImageHead('http://images.example/a.jpg')).resolves.toEqual({
      contentType: 'image/jpeg; charset=binary',
      contentLength: 1200,
    });
    const pinned = vi.mocked(http.request).mock.calls[0][1].lookup as (
      hostname: string,
      options: { all?: boolean } | ((err: null, address: string, family: number) => void),
      callback?: (err: null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
    ) => void;
    const all = vi.fn();
    pinned('images.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '1.1.1.1', family: 4 }]);
    const one = vi.fn();
    pinned('images.example', {}, one);
    expect(one).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    const direct = vi.fn();
    pinned('images.example', direct);
    expect(direct).toHaveBeenCalledWith(null, '1.1.1.1', 4);
    expect(pinned('images.example', {})).toBeUndefined();
  });

  it('uses https and treats a missing or invalid length as null', async () => {
    installHead(https.request as never, {
      status: 200,
      headers: { 'content-type': ['image/png', 'image/jpeg'], 'content-length': 'nope' },
    });
    vi.mocked(lookup).mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }] as never);
    await expect(probeFeedImageHead('https://cdn.example/a.png')).resolves.toEqual({
      contentType: 'image/png',
      contentLength: null,
    });
    const pinned = vi.mocked(https.request).mock.calls[0][1].lookup as (
      hostname: string,
      options: { all?: boolean },
      callback: (err: null, address: Array<{ address: string; family: number }>) => void,
    ) => void;
    const all = vi.fn();
    pinned('cdn.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '2606:4700:4700::1111', family: 6 }]);
  });

  it('follows a redirect and stops after the hop cap or a non-success status', async () => {
    let hops = 0;
    installHead(http.request as never, () => {
      hops += 1;
      if (hops === 1) return { status: 302, headers: { location: '/b.jpg' } };
      return { status: 200, headers: { 'content-type': 'image/webp', 'content-length': '40' } };
    });
    await expect(probeFeedImageHead('http://cdn.example/a.jpg')).resolves.toEqual({
      contentType: 'image/webp',
      contentLength: 40,
    });

    hops = 0;
    installHead(http.request as never, () => {
      hops += 1;
      return { status: 302, headers: { location: `/hop-${hops}.jpg` } };
    });
    await expect(probeFeedImageHead('http://cdn.example/loop.jpg')).resolves.toBeNull();

    installHead(http.request as never, { status: 404, headers: { 'content-type': 'text/plain' } });
    await expect(probeFeedImageHead('http://cdn.example/missing.jpg')).resolves.toBeNull();
  });

  it('returns null when DNS is empty, blocked, or fails', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([] as never);
    await expect(probeFeedImageHead('http://cdn.example/empty.jpg')).resolves.toBeNull();

    vi.mocked(lookup).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }] as never);
    await expect(probeFeedImageHead('http://cdn.example/meta.jpg')).resolves.toBeNull();

    vi.mocked(lookup).mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(probeFeedImageHead('http://cdn.example/nx.jpg')).resolves.toBeNull();

    installHead(http.request as never, { error: new Error('socket') });
    await expect(probeFeedImageHead('http://cdn.example/down.jpg')).resolves.toBeNull();
  });

  it('returns null when DNS does not answer before the probe timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockImplementation(() => new Promise(() => {}) as never);
    const pending = probeFeedImageHead('http://cdn.example/slow.jpg');
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBeNull();
    vi.useRealTimers();
  });
});
