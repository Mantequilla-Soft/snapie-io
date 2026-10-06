import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, trustedClientIp, type RateLimitEntry } from '@/lib/http/rateLimit';
import { auditFirstScreenLcp, normalizeFeedLcpBodies } from '@/lib/images/feedLcp';
import { probeFeedImageHead } from '@/lib/images/feedLcpProbe';

export const runtime = 'nodejs';

// One call per home-feed paint. The limiter is per instance and resets on
// cold start. The key is the Cloudflare client IP, not X-Forwarded-For.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * HEAD the leading home-feed images and return the LCP photo.
 *
 * The browser cannot read Content-Length on a third-party GIF or photo
 * (CORS). This route uses the same URL policy as the image proxy and does
 * not download the body. `rawUrl` is null when every candidate is a GIF, a
 * video, or over the size cap — the client must not fall back to those.
 * If the audit hits its deadline, `rawUrl` is the extension-only pick
 * instead: GIF and video stay deferred, and the byte cap is not applied.
 */
export async function POST(request: NextRequest) {
  const ip = trustedClientIp(request.headers);
  if (!checkRateLimit(rateLimitMap, ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const bodies = normalizeFeedLcpBodies(payload);
  if (!bodies) {
    return NextResponse.json({ error: 'Expected a bodies array' }, { status: 400 });
  }

  const decision = await auditFirstScreenLcp(bodies, probeFeedImageHead);
  return NextResponse.json({
    rawUrl: decision.chosen?.rawUrl ?? null,
    deferUrls: decision.deferUrls,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
