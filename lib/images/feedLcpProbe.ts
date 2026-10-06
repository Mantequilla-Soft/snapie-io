import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { assertSafeProxyUrl, isBlockedIpAddress } from '@/lib/images/imageProxy';
import type { LcpImageProbe } from '@/lib/images/feedLcp';

const PROBE_TIMEOUT_MS = 1500;
const MAX_REDIRECTS = 3;

/**
 * HEAD the upstream image for Content-Type and Content-Length.
 *
 * Same URL policy as the image proxy: http(s) only, no credentials, no
 * private names, and DNS answers are rejected when any address is blocked.
 * The socket is pinned to the checked address. A failure returns null so
 * the picker can keep a known photo or skip an unclassified URL.
 * This does not download the body.
 */
export async function probeFeedImageHead(rawUrl: string): Promise<LcpImageProbe | null> {
  try {
    let current = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = assertSafeProxyUrl(current);
      const records = await lookupWithTimeout(url.hostname);
      if (records.length === 0) return null;
      if (records.some((record) => isBlockedIpAddress(record.address))) return null;
      const chosen = records[0];
      const family: 4 | 6 = chosen.family === 6 ? 6 : 4;
      const head = await headPinned(url, chosen.address, family);
      if (head.status >= 300 && head.status < 400 && head.location && hop < MAX_REDIRECTS) {
        current = new URL(head.location, url).href;
        continue;
      }
      if (head.status < 200 || head.status >= 300) return null;
      return { contentType: head.contentType, contentLength: head.contentLength };
    }
    return null;
  } catch {
    return null;
  }
}

function lookupWithTimeout(hostname: string) {
  return new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dns-timeout')), PROBE_TIMEOUT_MS);
    dnsLookup(hostname, { all: true, verbatim: true }).then(
      (records) => {
        clearTimeout(timer);
        resolve(records);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function headerOne(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw === '') return null;
  return raw;
}

function parseLength(value: string | string[] | undefined): number | null {
  const raw = headerOne(value);
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function headPinned(
  target: URL,
  address: string,
  family: 4 | 6,
): Promise<{ status: number; location: string | null; contentType: string | null; contentLength: number | null }> {
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      target,
      {
        method: 'HEAD',
        lookup: ((_hostname, options, callback) => {
          const cb = typeof options === 'function' ? options : callback;
          if (!cb) return;
          if (typeof options !== 'function' && options.all) {
            cb(null, [{ address, family }]);
            return;
          }
          cb(null, address, family);
        }) as http.RequestOptions['lookup'],
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.1',
          'User-Agent': 'Mozilla/5.0 (compatible; SnapieImageProxy/1.0; +https://snapie.io)',
        },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode ?? 0,
          location: headerOne(res.headers.location),
          contentType: headerOne(res.headers['content-type']),
          contentLength: parseLength(res.headers['content-length']),
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}
