import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { installDeferredScriptResponse } from './installDeferredScriptResponse.js';

const HTML = '<!DOCTYPE html><html><head><script src="/_next/static/chunks/app-aaa.js" async=""></script></head><body><p>Hello</p></body></html>';

installDeferredScriptResponse();

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no port');
      resolve(address.port);
    });
  });
}

describe('installDeferredScriptResponse', () => {
  const servers: Array<ReturnType<typeof createServer>> = [];
  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  });

  it('rewrites a plain HTML document', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(HTML);
    });
    servers.push(server);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('data-snapie-src="/_next/static/chunks/app-aaa.js"');
    expect(text).not.toContain('<script src="/_next/static/chunks/app-aaa.js"');
    expect(text).toContain('<p>Hello</p>');
  });

  it('rewrites a gzipped HTML document and leaves javascript alone', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/app.js') {
        res.setHeader('content-type', 'application/javascript');
        res.setHeader('content-encoding', 'gzip');
        res.end(gzipSync('console.log(1)'));
        return;
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('content-encoding', 'gzip');
      const gz = gzipSync(HTML);
      res.write(gz.subarray(0, 20));
      res.end(gz.subarray(20));
    });
    servers.push(server);
    const port = await listen(server);

    const js = await fetch(`http://127.0.0.1:${port}/app.js`);
    expect(await js.text()).toBe('console.log(1)');

    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    expect(html).toContain('data-snapie-src="/_next/static/chunks/app-aaa.js"');
    expect(html).toContain('requestAnimationFrame');
  });
});
