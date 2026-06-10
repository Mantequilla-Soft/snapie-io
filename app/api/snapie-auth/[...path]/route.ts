import { NextRequest, NextResponse } from 'next/server'

const BASE = process.env.SNAPIE_AUTH_URL

if (!BASE && process.env.NODE_ENV === 'production') {
  console.warn('SNAPIE_AUTH_URL is not set — Snapie Auth proxy will fail')
}

function stripDomain(setCookieHeader: string): string {
  return setCookieHeader.replace(/;\s*domain=[^;]*/gi, '')
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
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
  const clientIp = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip')
  if (clientIp) fwdHeaders['X-Forwarded-For'] = clientIp
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

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}
export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}
export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}
