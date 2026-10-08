import { NextRequest, NextResponse } from 'next/server'
import { trustedClientIp } from '@/lib/http/rateLimit'

const BASE = process.env.SNAPIE_AUTH_URL

if (!BASE && process.env.NODE_ENV === 'production') {
  console.warn('SNAPIE_AUTH_URL is not set — Snapie Auth proxy will fail')
}

const SESSION_COOKIE = 'snapieauth_session'

function stripDomain(setCookieHeader: string): string {
  return setCookieHeader.replace(/;\s*domain=[^;]*/gi, '');
}

function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  return cookieHeader.split(';').some((part) => {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) return false
    return trimmed.slice(0, eq) === SESSION_COOKIE && trimmed.slice(eq + 1).length > 0
  })
}

// GET /auth/me with no session cookie is a 401 from the auth service before
// any user lookup. Answer here so guests and wallet sessions do not spend
// the shared upstream auth allowance. The cookie is httpOnly, so the check
// has to live on the proxy — the client cannot see it.
function isAnonymousSessionCheck(req: NextRequest, path: string[]): boolean {
  return req.method === 'GET'
    && path.length === 2
    && path[0] === 'auth'
    && path[1] === 'me'
    && !hasSessionCookie(req.headers.get('cookie'))
}

function isLimitHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'retry-after' || lower === 'ratelimit' || lower.startsWith('ratelimit-')
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  if (isAnonymousSessionCheck(req, path)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!BASE) {
    return NextResponse.json({ error: 'snapie_auth_not_configured' }, { status: 503 })
  }

  const upstream = `${BASE}/api/${path.join('/')}`
  const qs = req.nextUrl.searchParams.toString()
  const url = qs ? `${upstream}?${qs}` : upstream

  const rawCookies = req.headers.get('cookie') ?? ''
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)

  // Only forward Snapie Auth cookies — never leak unrelated session cookies.
  const SNAPIE_COOKIE_NAMES = ['snapieauth_session', 'snapieauth_csrf']
  const filteredCookies = rawCookies
    .split(';')
    .map((c) => c.trim())
    .filter((c) => SNAPIE_COOKIE_NAMES.some((n) => c.startsWith(n + '=')))
    .join('; ')

  const fwdHeaders: Record<string, string> = {}
  if (filteredCookies) fwdHeaders['Cookie'] = filteredCookies
  // Forward only the Cloudflare-verified visitor IP as a single value.
  // x-forwarded-for here ends with the Cloudflare edge address (nginx appends
  // $remote_addr), which would make every visitor behind that edge share one
  // snapie-auth rate-limit bucket.
  const clientIp = trustedClientIp(req.headers)
  if (clientIp !== 'unknown') fwdHeaders['X-Forwarded-For'] = clientIp
  if (isMutating) {
    const ct = req.headers.get('content-type')
    if (ct) fwdHeaders['Content-Type'] = ct
    const m = rawCookies.match(/snapieauth_csrf=([^;]+)/)
    if (m) {
      try {
        fwdHeaders['x-csrf-token'] = decodeURIComponent(m[1])
      } catch {
        // Malformed percent-encoding — skip injecting the token
      }
    }
  }

  const body = isMutating ? await req.text() : undefined

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  let res: Response
  try {
    res = await fetch(url, {
      method: req.method,
      headers: fwdHeaders,
      body: body || undefined,
      signal: controller.signal,
    })
  } catch (err) {
    console.error('[snapie-auth proxy] upstream error:', err)
    return NextResponse.json({ error: 'proxy_upstream_error' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }

  const resBody = await res.arrayBuffer()
  const next = new NextResponse(resBody, { status: res.status })

  const ct = res.headers.get('content-type')
  if (ct) next.headers.set('content-type', ct)

  // Surface the auth service's own limit so clients and logs can see it.
  res.headers.forEach((value, key) => {
    if (isLimitHeader(key)) next.headers.set(key, value)
  })

  // Forward Set-Cookie headers, stripping Domain so they land on our domain.
  // getSetCookie() returns an array (one entry per Set-Cookie header).
  const cookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean)

  for (const c of cookies) {
    if (c) next.headers.append('set-cookie', stripDomain(c))
  }

  return next
}

export async function GET(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return proxy(req, params.path)
}
export async function POST(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return proxy(req, params.path)
}
export async function PUT(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return proxy(req, params.path)
}
export async function PATCH(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return proxy(req, params.path)
}
export async function DELETE(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  return proxy(req, params.path)
}
