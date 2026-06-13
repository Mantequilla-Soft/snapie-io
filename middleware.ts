import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://3speak.tv',
  'https://www.3speak.tv',
  'https://snapie.io',
  'https://www.snapie.io',
];

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin);

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
  matcher: '/api/chat/:path*',
};
