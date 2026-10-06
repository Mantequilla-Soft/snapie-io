import { NextRequest, NextResponse } from 'next/server';
import { auditFirstScreenLcp, normalizeFeedLcpBodies } from '@/lib/images/feedLcp';
import { probeFeedImageHead } from '@/lib/images/feedLcpProbe';

export const runtime = 'nodejs';

// One call per home-feed paint. The limiter is per instance and resets on
// cold start, same shape as the image proxy.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

/**
 * HEAD the leading home-feed images and return the LCP photo.
 *
 * The browser cannot read Content-Length on a third-party GIF or photo
 * (CORS). This route uses the same URL policy as the image proxy and does
 * not download the body. `rawUrl` is null when every candidate is a GIF, a
 * video, or over the size cap — the client must not fall back to those.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
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
