import { NextRequest, NextResponse } from 'next/server'

const FALLBACK_NODES = [
  'https://api.hive.blog',
  'https://api.openhive.network',
  'https://techcoderx.com',
  'https://rpc.mahdiyari.info',
  'https://api.c0ff33a.uk',
  'https://hapi.ecency.com',
  'https://api.syncad.com',
]

const EXCLUDED_HOSTS = ['api.deathwing.me']
const BEACON_URL = 'https://beacon.peakd.com/api/nodes'
const MIN_SCORE = 80

// Simple warm-cache: survives across requests within the same serverless instance.
let nodeCache: { nodes: string[]; at: number } | null = null
const NODE_CACHE_TTL_MS = 5 * 60 * 1000

async function getNodes(): Promise<string[]> {
  if (nodeCache && Date.now() - nodeCache.at < NODE_CACHE_TTL_MS) {
    return nodeCache.nodes
  }
  try {
    const res = await fetch(BEACON_URL, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data: Array<{ endpoint?: string; score?: number }> = await res.json()
      const nodes = data
        .filter(
          (n): n is { endpoint: string; score: number } =>
            typeof n.score === 'number' &&
            n.score >= MIN_SCORE &&
            typeof n.endpoint === 'string' &&
            n.endpoint.length > 0 &&
            !EXCLUDED_HOSTS.some(h => n.endpoint!.includes(h))
        )
        .sort((a, b) => b.score - a.score)
        .map(n => n.endpoint.trim())

      if (nodes.length >= 2) {
        nodeCache = { nodes, at: Date.now() }
        return nodes
      }
    }
  } catch { /* fall through to hardcoded list */ }

  return FALLBACK_NODES
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const nodes = await getNodes()

  for (const node of nodes.slice(0, 6)) {
    try {
      const res = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(9000),
      })
      if (!res.ok) continue
      const data: unknown = await res.json()
      return NextResponse.json(data)
    } catch {
      // Node unreachable or timed out — try next
    }
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32603, message: 'All Hive nodes unreachable' }, id: null },
    { status: 503 }
  )
}
