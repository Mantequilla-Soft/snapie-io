import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { fetchProxiedImage, ImageProxyError } from './imageProxy';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

vi.mock('node:http', () => {
  class Agent {
    destroy() {}
  }
  const request = vi.fn();
  return { default: { request, Agent }, request, Agent };
});

vi.mock('node:https', () => {
  class Agent {
    destroy() {}
  }
  const request = vi.fn();
  return { default: { request, Agent }, request, Agent };
});

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

type Script = {
  status?: number;
  headers?: http.IncomingHttpHeaders;
  chunks?: Buffer[];
  error?: Error;
  mode?: 'body' | 'redirect' | 'destroy-length';
};

function scriptResponse(script: Script) {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    resume: () => void;
    destroy: () => void;
  };
  res.statusCode = script.status ?? 200;
  res.headers = script.headers ?? { 'content-type': 'image/jpeg', 'content-length': String(JPEG.length) };
  res.destroy = vi.fn();
  res.resume = () => {
    queueMicrotask(() => res.emit('end'));
  };
  queueMicrotask(() => {
    if (script.mode === 'destroy-length') return;
    if ((script.status ?? 200) >= 300 && (script.status ?? 200) < 400) return;
    for (const chunk of script.chunks ?? [JPEG]) res.emit('data', chunk);
    res.emit('end');
  });
  return res;
}

function install(request: ReturnType<typeof vi.fn>, script: Script | ((url: URL) => Script)) {
  request.mockImplementation((target: URL, options: { lookup?: Function; signal?: AbortSignal }, cb: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (err?: Error) => void;
      setTimeout: (ms: number, fn: () => void) => void;
    };
    let timeout: (() => void) | undefined;
    req.setTimeout = (_ms, fn) => {
      timeout = fn;
    };
    req.destroy = (err?: Error) => {
      if (err) req.emit('error', err);
    };
    req.end = () => {
      const resolved = typeof script === 'function' ? script(target) : script;
      (req as EventEmitter & { timeout?: () => void }).timeout = timeout;
      if (resolved.error) {
        req.emit('error', resolved.error);
        return;
      }
      const captured = options.lookup;
      if (captured) {
        captured('ignored', { all: true }, () => undefined);
        captured('ignored', {}, () => undefined);
        captured('ignored', () => undefined);
        captured('ignored', {});
      }
      cb(scriptResponse(resolved));
    };
    return req;
  });
}

beforeEach(() => {
  vi.mocked(lookup).mockReset();
  vi.mocked(http.request).mockReset();
  vi.mocked(https.request).mockReset();
  vi.mocked(lookup).mockResolvedValue([{ address: '1.1.1.1', family: 4 }] as never);
});

describe('default image proxy transport', () => {
  it('fetches a public http image and pins the socket lookup', async () => {
    install(http.request as never, { status: 200 });
    const image = await fetchProxiedImage('http://cdn.example/a.jpg');
    expect(image.contentType).toBe('image/jpeg');
    expect(image.body.equals(JPEG)).toBe(true);
    expect(lookup).toHaveBeenCalledWith('cdn.example', { all: true, verbatim: true });
  });

  it('follows one redirect and reads an array location header', async () => {
    let calls = 0;
    install(https.request as never, () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 302,
          headers: { location: ['/b.jpg'], 'content-type': 'text/plain' },
          mode: 'redirect',
        };
      }
      return { status: 200 };
    });
    const image = await fetchProxiedImage('https://cdn.example/a.jpg');
    expect(image.contentType).toBe('image/jpeg');
    expect(https.request).toHaveBeenCalledTimes(2);
  });

  it('rejects a private DNS answer, an empty answer, and a lookup failure', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }] as never);
    await expect(fetchProxiedImage('https://blocked.example/a.jpg')).rejects.toMatchObject({ code: 'blocked-resolved-ip' });

    vi.mocked(lookup).mockResolvedValueOnce([] as never);
    await expect(fetchProxiedImage('https://empty.example/a.jpg')).rejects.toMatchObject({ code: 'dns-empty' });

    vi.mocked(lookup).mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(fetchProxiedImage('https://nx.example/a.jpg')).rejects.toMatchObject({ code: 'dns-failed' });
  });

  it('turns a socket error and an abort into proxy errors', async () => {
    install(http.request as never, { error: new Error('ECONNRESET') });
    await expect(fetchProxiedImage('http://cdn.example/down.jpg')).rejects.toMatchObject({ code: 'upstream-error' });

    install(http.request as never, { error: Object.assign(new Error('aborted'), { name: 'AbortError' }) });
    await expect(fetchProxiedImage('http://cdn.example/abort.jpg')).rejects.toMatchObject({ code: 'timeout' });

    install(http.request as never, { error: new ImageProxyError(504, 'timeout') });
    await expect(fetchProxiedImage('http://cdn.example/already.jpg')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('rejects an oversized declared length before reading the body', async () => {
    install(http.request as never, {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(11 * 1024 * 1024) },
      mode: 'destroy-length',
    });
    await expect(fetchProxiedImage('http://cdn.example/huge.jpg')).rejects.toMatchObject({ code: 'too-large' });
  });

  it('rejects a body that grows past the size cap', async () => {
    const chunk = Buffer.alloc(6 * 1024 * 1024);
    install(http.request as never, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      chunks: [chunk, chunk],
    });
    await expect(fetchProxiedImage('http://cdn.example/stream.jpg')).rejects.toMatchObject({ code: 'too-large' });
  });

  it('maps the request timeout callback to a timeout error', async () => {
    vi.mocked(http.request).mockImplementation(() => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: Error) => void;
        setTimeout: (ms: number, fn: () => void) => void;
      };
      let timeout: (() => void) | undefined;
      req.destroy = (err?: Error) => {
        if (err) req.emit('error', err);
      };
      req.setTimeout = (_ms, fn) => {
        timeout = fn;
      };
      req.end = () => timeout?.();
      return req;
    });
    await expect(fetchProxiedImage('http://cdn.example/slow.jpg')).rejects.toMatchObject({ code: 'timeout' });
  });

});
