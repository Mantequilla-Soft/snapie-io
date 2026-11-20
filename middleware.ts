import { NextRequest, NextResponse } from 'next/server';
import { hiveAccountStatus, hivePostStatus, type HiveExistence } from '@/lib/http/crawlerNotFound';

const ALLOWED_EXACT = [
  'https://snapie.io',
  'https://www.snapie.io',
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_EXACT.includes(origin)) return true;
  // Allow any subdomain of 3speak.tv (covers dev branches, staging, etc.)
  try {
    const { hostname } = new URL(origin);
    return hostname === '3speak.tv' || hostname.endsWith('.3speak.tv');
  } catch {
    return false;
  }
}

// Single-segment routes that exist under app/. app/loading.tsx streams the
// shell before a page can call notFound(), so an unknown /segment would be a
// 200 soft 404; middleware answers it with a real 404 instead. A test keeps
// this list in sync with the app/ directory.
export const TOP_LEVEL_ROUTES = [
  'api', 'blog', 'changelog', 'chat', 'compose', 'edit', 'explore', 'factory',
  'games', 'hangouts', 'join', 'leaderboard', 'profile', 'settings', 'shorts',
  'support', 'test-sanitize', 'wallet',
];

const SUBPAGES = new Set(['wallet', 'notifications']);

/** The Hive lookup this path needs, or null when the path is not a profile/post. */
function existenceCheck(pathname: string): (() => Promise<HiveExistence>) | null {
  let parts: string[];
  try {
    parts = pathname.split('/').slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (parts.at(-1) === '') parts.pop();
  // /hive-123456/@author/permlink is the same post as /@author/permlink.
  if (parts.length === 3 && /^hive-\d+$/.test(parts[0])) parts = parts.slice(1);
  const [user, permlink] = parts;
  if (!user?.startsWith('@')) return null;
  const name = user.slice(1);
  if (parts.length === 1) return () => hiveAccountStatus(name);
  if (parts.length === 2 && !SUBPAGES.has(permlink)) return () => hivePostStatus(name, permlink);
  return null;
}

function notFoundResponse(req: NextRequest) {
  return NextResponse.rewrite(new URL('/_not-found', req.url), { status: 404 });
}

/**
 * Real 404 for a post or account Hive says is missing (see
 * lib/http/crawlerNotFound.ts). loading.tsx / layout Suspense stream a 200
 * shell before generateMetadata or the page can call notFound(), so the
 * status has to be set here — for visitors and crawlers alike. A timeout or
 * node error is not a 404.
 */
async function existenceGuard(req: NextRequest, check: () => Promise<HiveExistence>) {
  if ((await check()) === 'missing') return notFoundResponse(req);
  return NextResponse.next();
}

/**
 * In-app navigations and prefetches fetch the RSC payload, not a document.
 * Their status code is never seen by a crawler and the page's own notFound()
 * still shows the not-found view, so they skip the Hive lookup and stay fast.
 */
function isClientNavigation(req: NextRequest): boolean {
  return req.headers.get('rsc') === '1' || req.headers.has('next-router-prefetch');
}

export function middleware(req: NextRequest) {
  const segments = req.nextUrl.pathname.split('/');
  if (segments.length === 2 && segments[1] && !/^[@_]|\./.test(segments[1]) && !TOP_LEVEL_ROUTES.includes(segments[1])) {
    return notFoundResponse(req);
  }

  // Hive account names are lowercase, so /@SNAPIE is the same page as /@snapie.
  // Only the username segment is lowercased; permlinks are case-sensitive.
  const [, user, ...rest] = req.nextUrl.pathname.split('/');
  if (user.startsWith('@') && user !== user.toLowerCase()) {
    const url = req.nextUrl.clone();
    url.pathname = ['', user.toLowerCase(), ...rest].join('/');
    return NextResponse.redirect(url, 308);
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && !isClientNavigation(req)) {
    const check = existenceCheck(req.nextUrl.pathname);
    if (check) return existenceGuard(req, check);
  }

  const origin = req.headers.get('origin') ?? '';
  const allowed = isAllowedOrigin(origin);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin, allowed),
    });
  }

  const res = NextResponse.next();
  if (allowed) {
    for (const [k, v] of Object.entries(corsHeaders(origin, allowed))) {
      res.headers.set(k, v);
    }
  }
  return res;
}

function corsHeaders(origin: string, allowed: boolean): Record<string, string> {
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export const config = {
  matcher: [
    // One bare segment: not an @user, not a file (has a dot), not /_next.
    '/:segment([^/.@_][^/.]*)',
    '/api/chat/:path*',
    '/api/upload-image',
    // Only /@names containing an uppercase letter, so other pages skip middleware.
    '/:user(@[^/]*[A-Z][^/]*)/:path*',
    // Profiles and posts: Hive existence check so missing ones are a real 404.
    '/:user(@[^/]+)',
    '/:user(@[^/]+)/:permlink([^/]+)',
    '/:community(hive-\\d+)/:user(@[^/]+)/:permlink([^/]+)',
  ],
};
