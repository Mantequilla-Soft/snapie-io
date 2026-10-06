/**
 * Server-side Hive RPC proxy: one node at a time, failing over only when
 * the node itself is unhealthy. JSON-RPC application errors are the caller's
 * result and are returned as-is.
 */

const BEACON_URL = 'https://beacon.peakd.com/api/nodes'
const BEACON_TIMEOUT_MS = 4000
const MIN_SCORE = 80
const NODE_CACHE_TTL_MS = 5 * 60 * 1000

/** Per-attempt budget. Transport failures return immediately; a hung socket waits this long. */
export const ATTEMPT_TIMEOUT_MS = 8000
/** Skip a node that just failed so the next call does not start on it. */
export const FAILURE_COOLDOWN_MS = 60_000
const MAX_NODES_PER_CALL = 6

const EXCLUDED_HOSTS = ['api.deathwing.me']
// Live again (HTTP 200) but beacon score stays under MIN_SCORE and it has
// been flaky. Eligible only after healthier nodes, unless it was the last
// node that actually succeeded.
const DEMOTED_HOSTS = ['techcoderx.com']

export const FALLBACK_NODES = [
  'https://api.hive.blog',
  'https://api.openhive.network',
  'https://rpc.mahdiyari.info',
  'https://api.c0ff33a.uk',
  'https://api.syncad.com',
  // hapi.ecency.com is omitted: the name does not resolve, and beacon scores it 0.
  'https://techcoderx.com',
]

export const ALL_NODES_UNREACHABLE = {
  jsonrpc: '2.0',
  error: { code: -32603, message: 'All Hive nodes unreachable' },
  id: null,
}

type BeaconNode = { endpoint?: string; score?: number }

let nodeCache: { nodes: string[]; at: number } | null = null
let lastSuccessNode: string | null = null
const cooldownUntil = new Map<string, number>()

export function resetRpcProxyState(): void {
  nodeCache = null
  lastSuccessNode = null
  cooldownUntil.clear()
}

function hostname(endpoint: string): string {
  try {
    return new URL(endpoint).hostname
  } catch {
    return ''
  }
}

function isExcluded(endpoint: string): boolean {
  return EXCLUDED_HOSTS.some((host) => endpoint.includes(host))
}

function isDemoted(endpoint: string): boolean {
  const host = hostname(endpoint)
  return DEMOTED_HOSTS.some((demoted) => host === demoted)
}

/** Healthy nodes first; demoted hosts stay in the list but never lead it. */
function demoteNodes(nodes: string[]): string[] {
  const primary: string[] = []
  const demoted: string[] = []
  for (const node of nodes) {
    if (isDemoted(node)) demoted.push(node)
    else primary.push(node)
  }
  return [...primary, ...demoted]
}

export function selectBeaconNodes(data: unknown): string[] | null {
  if (!Array.isArray(data)) return null
  const nodes = (data as BeaconNode[])
    .filter(
      (n): n is { endpoint: string; score: number } =>
        typeof n.score === 'number' &&
        n.score >= MIN_SCORE &&
        typeof n.endpoint === 'string' &&
        n.endpoint.length > 0 &&
        !isExcluded(n.endpoint)
    )
    .sort((a, b) => b.score - a.score)
    .map((n) => n.endpoint.trim())

  const ordered = demoteNodes(nodes)
  return ordered.length >= 2 ? ordered : null
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function getHiveRpcNodes(fetchImpl: FetchLike = fetch): Promise<string[]> {
  if (nodeCache && Date.now() - nodeCache.at < NODE_CACHE_TTL_MS) {
    return nodeCache.nodes
  }
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      BEACON_URL,
      { method: 'GET' },
      BEACON_TIMEOUT_MS,
    )
    if (res.ok) {
      const data: unknown = await res.json()
      const nodes = selectBeaconNodes(data)
      if (nodes) {
        nodeCache = { nodes, at: Date.now() }
        return nodes
      }
    }
  } catch {
    /* fall through to the hardcoded list */
  }
  return demoteNodes(FALLBACK_NODES)
}

function noteSuccess(node: string): void {
  lastSuccessNode = node
  cooldownUntil.delete(node)
}

function noteFailure(node: string, now: number): void {
  cooldownUntil.set(node, now + FAILURE_COOLDOWN_MS)
  if (lastSuccessNode === node) lastSuccessNode = null
}

/** Last success first, then the configured order, skipping nodes still in cooldown. */
function orderNodesForAttempt(nodes: string[], now: number): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const raw of nodes) {
    if (typeof raw !== 'string') continue
    const node = raw.trim()
    if (!node || seen.has(node)) continue
    seen.add(node)
    unique.push(node)
  }

  const ready = unique.filter((node) => (cooldownUntil.get(node) ?? 0) <= now)
  const pool = ready.length > 0 ? ready : unique
  const preferred = lastSuccessNode
  const ordered =
    preferred && pool.includes(preferred)
      ? [preferred, ...pool.filter((node) => node !== preferred)]
      : pool
  return ordered.slice(0, MAX_NODES_PER_CALL)
}

function isJsonRpcApplicationError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const error = (data as { error?: unknown }).error
  if (!error || typeof error !== 'object') return false
  return typeof (error as { code?: unknown }).code === 'number'
}

export type RpcDispatchResult = { ok: true; data: unknown } | { ok: false }

export type DispatchOptions = {
  fetchImpl?: FetchLike
  timeoutMs?: number
  now?: () => number
}

/**
 * POST `body` to one node at a time. Fail over on transport errors, timeouts,
 * and HTTP 5xx. A JSON-RPC error object (the node understood the call and
 * rejected it) is returned unchanged.
 */
export async function dispatchHiveRpc(
  body: unknown,
  nodes: string[],
  options: DispatchOptions = {},
): Promise<RpcDispatchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? ATTEMPT_TIMEOUT_MS
  const now = options.now ?? Date.now
  const candidates = orderNodesForAttempt(nodes, now())

  for (const node of candidates) {
    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        node,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
      )

      if (res.status >= 500) {
        await res.body?.cancel().catch(() => undefined)
        noteFailure(node, now())
        continue
      }

      let data: unknown
      try {
        data = await res.json()
      } catch {
        noteFailure(node, now())
        continue
      }

      if (res.ok || isJsonRpcApplicationError(data)) {
        noteSuccess(node)
        return { ok: true, data }
      }

      noteFailure(node, now())
    } catch {
      noteFailure(node, now())
    }
  }

  return { ok: false }
}
