import { NextResponse } from 'next/server';
import { getEquippedMap } from '@/lib/moodBadges/service';

// Public read — an equipped mood badge is exactly as public as a patron
// tier or points balance (see app/api/patrons/route.ts, app/api/points/summary/route.ts).
//
// force-dynamic is load-bearing: this GET takes no params and calls no
// dynamic request API, so without it Next statically caches the handler
// itself at build/first-request time and NEVER reruns getEquippedMap()
// again in production — the Cache-Control header below only governs a
// downstream CDN/browser, it does not opt this route out of Next's own
// static caching. (Root cause of a real bug: a freshly-equipped badge
// stayed permanently stuck on the old one in prod, while `next dev` —
// which never statically caches route handlers — showed it correctly.)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const map = await getEquippedMap();
  return NextResponse.json(map, {
    headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=60' },
  });
}
