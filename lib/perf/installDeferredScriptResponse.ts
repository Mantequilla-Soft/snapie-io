import { ServerResponse } from 'http';
import { gzipSync, gunzipSync } from 'zlib';
import { deferFrameworkScripts } from './deferFrameworkScripts';

const INSTALLED = Symbol('snapieDeferredScriptsInstalled');
const BUFFER = Symbol('snapieDeferredScriptsBuffer');

type PatchedResponse = ServerResponse & { [BUFFER]?: { chunks: Buffer[] } };

function isHtml(res: ServerResponse): boolean {
  const header = res.getHeader('content-type');
  const value = Array.isArray(header) ? header.join(';') : String(header || '');
  return value.includes('text/html');
}

function toBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, encoding || 'utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk ?? ''), encoding || 'utf8');
}

function isGzip(body: Buffer): boolean {
  return body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b;
}

/**
 * `next start` gzips the document inside the compression middleware, which
 * writes already-compressed bytes through ServerResponse. Buffer those bytes,
 * rewrite the HTML, and send one body. Non-HTML responses are untouched.
 */
export function installDeferredScriptResponse(): void {
  const proto = ServerResponse.prototype as ServerResponse & { [INSTALLED]?: boolean };
  if (proto[INSTALLED]) return;
  proto[INSTALLED] = true;

  const origWrite = ServerResponse.prototype.write;
  const origEnd = ServerResponse.prototype.end;

  ServerResponse.prototype.write = function write(
    this: PatchedResponse,
    chunk: unknown,
    encoding?: BufferEncoding | ((error: Error | null | undefined) => void),
    cb?: (error: Error | null | undefined) => void,
  ) {
    if (!isHtml(this)) {
      return origWrite.call(this, chunk as never, encoding as never, cb as never);
    }
    let callback = cb;
    let enc: BufferEncoding | undefined;
    if (typeof encoding === 'function') {
      callback = encoding;
    } else {
      enc = encoding;
    }
    const state = this[BUFFER] || { chunks: [] };
    state.chunks.push(toBuffer(chunk, enc));
    this[BUFFER] = state;
    if (callback) callback(null);
    return true;
  } as ServerResponse['write'];

  ServerResponse.prototype.end = function end(
    this: PatchedResponse,
    chunk?: unknown,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void,
  ) {
    let data = chunk;
    let enc: BufferEncoding | undefined;
    let callback = cb;
    if (typeof data === 'function') {
      callback = data as () => void;
      data = undefined;
    } else if (typeof encoding === 'function') {
      callback = encoding;
    } else {
      enc = encoding;
    }

    if (!isHtml(this)) {
      return origEnd.call(this, data as never, enc as never, callback as never);
    }

    const state = this[BUFFER] || { chunks: [] };
    this[BUFFER] = undefined;
    if (data !== undefined && data !== null) state.chunks.push(toBuffer(data, enc));
    let body = Buffer.concat(state.chunks);
    const gzipped = isGzip(body) || String(this.getHeader('content-encoding') || '').includes('gzip');

    try {
      const html = (gzipped && isGzip(body) ? gunzipSync(body) : body).toString('utf8');
      if (html.includes('<html') && html.includes('/_next/static/')) {
        const transformed = deferFrameworkScripts(html);
        if (transformed !== html) {
          body = gzipped ? gzipSync(Buffer.from(transformed)) : Buffer.from(transformed);
          if (!this.headersSent) {
            this.removeHeader('content-length');
            this.setHeader('content-length', String(body.length));
          }
        }
      }
    } catch {
      // Send the original bytes if the document cannot be rewritten.
    }

    return origEnd.call(this, body, callback as never);
  } as ServerResponse['end'];
}
