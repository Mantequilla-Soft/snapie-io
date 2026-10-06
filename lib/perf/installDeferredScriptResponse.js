const { ServerResponse } = require('http');
const { gzipSync, gunzipSync } = require('zlib');
const { deferFrameworkScripts } = require('./deferFrameworkScripts.js');

const INSTALLED = Symbol('snapieDeferredScriptsInstalled');
const BUFFER = Symbol('snapieDeferredScriptsBuffer');

function isHtml(res) {
  const header = res.getHeader('content-type');
  const value = Array.isArray(header) ? header.join(';') : String(header || '');
  return value.includes('text/html');
}

function toBuffer(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, encoding || 'utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk ?? ''), encoding || 'utf8');
}

function isGzip(body) {
  return body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b;
}

/**
 * `next start` gzips the document in the compression middleware, which writes
 * already-compressed bytes through ServerResponse. Buffer those bytes, rewrite
 * the HTML, and send one body. Non-HTML responses are untouched.
 *
 * This file is plain JS on purpose: the instrumentation hook is bundled for
 * the edge runtime too, and that bundle cannot import Node builtins. The
 * nodejs runtime loads this file with require() instead.
 */
function installDeferredScriptResponse() {
  if (ServerResponse.prototype[INSTALLED]) return;
  ServerResponse.prototype[INSTALLED] = true;

  const origWrite = ServerResponse.prototype.write;
  const origEnd = ServerResponse.prototype.end;

  ServerResponse.prototype.write = function write(chunk, encoding, cb) {
    if (!isHtml(this)) return origWrite.call(this, chunk, encoding, cb);
    let callback = cb;
    let enc;
    if (typeof encoding === 'function') callback = encoding;
    else enc = encoding;
    const state = this[BUFFER] || { chunks: [] };
    state.chunks.push(toBuffer(chunk, enc));
    this[BUFFER] = state;
    if (callback) callback(null);
    return true;
  };

  ServerResponse.prototype.end = function end(chunk, encoding, cb) {
    let data = chunk;
    let enc;
    let callback = cb;
    if (typeof data === 'function') {
      callback = data;
      data = undefined;
    } else if (typeof encoding === 'function') {
      callback = encoding;
    } else {
      enc = encoding;
    }

    if (!isHtml(this)) return origEnd.call(this, data, enc, callback);

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

    return origEnd.call(this, body, callback);
  };
}

module.exports = { installDeferredScriptResponse };
