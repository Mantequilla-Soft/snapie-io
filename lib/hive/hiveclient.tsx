import type { Client } from "@hiveio/dhive"
import { afterLcpPaint } from "@/lib/perf/afterLcpPaint"
import { installBrowserRpcCoalescer } from "@/lib/hive/rpcBatch"
import { withTimeout } from "@/lib/utils/withTimeout"

const FALLBACK_NODES = [
  "https://api.hive.blog",
  "https://api.openhive.network",
  "https://techcoderx.com",
  "https://rpc.mahdiyari.info",
  "https://api.c0ff33a.uk",
]

const EXCLUDED_NODE_HOSTS = [
  "api.deathwing.me",
]

const BEACON_API = "https://beacon.peakd.com/api/nodes"
const MIN_SCORE = 80

// True when this module is evaluated in the browser.
// Server-side (SSR/API routes): typeof window === 'undefined'
const IS_BROWSER = typeof window !== "undefined"

// dhive's own retry/timeout (retryingFetch in @hiveio/dhive) relies on a
// `timeout` option passed into fetch() — a node-fetch-only extension that
// native browser fetch silently ignores. In the browser (every HiveClient
// call here is routed through /api/hive-rpc), a stalled connection —
// backgrounded tab, laptop sleep/wake, a proxy dropping an idle connection —
// can leave that fetch promise pending forever, since dhive's own retry
// code lives in a catch block that's never reached. HiveClient wraps every
// call below with a timeout so a stall always eventually rejects instead of
// hanging whatever awaited it (and, transitively, any lock guarding that
// await) forever. Longer than /api/hive-rpc's own worst case — one node at a
// time, up to 6 attempts with an 8s timeout each, plus up to 4s for a stale
// beacon-node refresh — so a legitimately slow failover isn't cut off early;
// this is a hang watchdog, not a normal request timeout.
export const HIVE_RPC_TIMEOUT_MS = 65000

// Proxy object so reassigning .client propagates to all importers
// (export default captures a value, not a binding).
// The dhive constructor stays behind a dynamic import. A static import pulls
// secp256k1 and bytebuffer into the home page's first script tags, and
// Lighthouse then charges that download against the text paint.
const hive: { client: Client | null } = { client: null }
let clientReady: Promise<Client> | null = null

function loadDhive(): Promise<typeof import("@hiveio/dhive")> {
  // Server renders and API routes need the client immediately. In the
  // browser, wait until the home LCP image has painted so this download
  // is not in the critical path. Pages without that image resolve at once.
  if (!IS_BROWSER) return import("@hiveio/dhive")
  return afterLcpPaint().then(() => import("@hiveio/dhive"))
}

function ensureClient(): Promise<Client> {
  if (hive.client) return Promise.resolve(hive.client)
  if (!clientReady) {
    clientReady = loadDhive().then(({ Client: DhiveClient }) => {
      if (!hive.client) {
        if (IS_BROWSER) {
          const endpoint = window.location.origin + "/api/hive-rpc"
          hive.client = new DhiveClient([endpoint])
          installBrowserRpcCoalescer(hive.client, endpoint)
        } else {
          hive.client = new DhiveClient(filterNodeList(FALLBACK_NODES))
        }
      }
      return hive.client
    })
  }
  return clientReady
}

function isExcludedNode(endpoint: string): boolean {
  if (!endpoint || typeof endpoint !== "string") return false
  try {
    return EXCLUDED_NODE_HOSTS.includes(new URL(endpoint).hostname)
  } catch {
    return EXCLUDED_NODE_HOSTS.some(host => endpoint.includes(host))
  }
}

/** Dedupe and drop excluded / bad endpoints. */
function filterNodeList(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    if (typeof raw !== "string") continue
    const u = raw.trim()
    if (!u || seen.has(u) || isExcludedNode(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

export async function fetchHealthyNodes(): Promise<string[]> {
  try {
    const res = await fetch(BEACON_API)
    if (!res.ok) return filterNodeList(FALLBACK_NODES)

    const raw: unknown = await res.json()
    if (!Array.isArray(raw)) return filterNodeList(FALLBACK_NODES)

    const endpoints = (raw as Array<{ endpoint?: string; score?: number }>)
      .filter(
        (n): n is { endpoint: string; score: number } =>
          typeof n?.score === "number" &&
          n.score >= MIN_SCORE &&
          typeof n?.endpoint === "string" &&
          n.endpoint.length > 0
      )
      .filter(n => !isExcludedNode(n.endpoint))
      .sort((a, b) => b.score - a.score)
      .map(n => n.endpoint.trim())

    const healthy = filterNodeList(endpoints)
    return healthy.length >= 2 ? healthy : filterNodeList(FALLBACK_NODES)
  } catch {
    return filterNodeList(FALLBACK_NODES)
  }
}

// Server-side only: initialize with beacon nodes on first load.
// The browser always uses the proxy route — no direct node access needed.
if (!IS_BROWSER) {
  fetchHealthyNodes().then(async nodes => {
    const { Client: DhiveClient } = await loadDhive()
    hive.client = new DhiveClient(nodes)
    if (process.env.NODE_ENV === "development") {
      console.log("🔗 HiveClient (server) initialized with beacon nodes:", nodes)
    }
  }).catch(err => {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to initialize HiveClient with beacon nodes:", err)
    }
  })
}

/** Call before a critical server-side broadcast to guarantee fresh, healthy nodes. */
export async function refreshHiveNodes(): Promise<void> {
  if (IS_BROWSER) return // Browser always uses the proxy — nothing to refresh
  const nodes = await fetchHealthyNodes()
  const { Client: DhiveClient } = await loadDhive()
  hive.client = new DhiveClient(nodes)
}

// Recursive proxy that delegates all property access to the current
// hive.client, wrapping every method call in a timeout. `getTarget` stays a
// live closure at each level (not memoized) so reassigning hive.client
// (the server-side beacon-refresh hot-swap) is picked up on the very next
// call — same freshness the old flat proxy had, just with a timeout added.
//
// dhive's DatabaseAPI/BroadcastAPI capture the real Client in their own
// constructor and call `this.client.call(...)` directly, bypassing this
// proxy for that inner hop — so a call like `HiveClient.database.call(...)`
// still gets exactly one timeout wrap, never nested.
//
// No receiver is passed to Reflect.get (unlike the old flat proxy): dhive
// has no getters/accessors, so it's a no-op today, and passing this proxy
// itself as receiver would risk infinite recursion if dhive ever added one.
// Path proxy: `HiveClient.database.call(...)` does not touch dhive until the
// call. Intermediate gets only append a property name.
function lazyHiveApi(path: Array<string | symbol> = []): any {
  const callable = function hiveLazyCall() { /* invoked via the apply trap */ }
  return new Proxy(callable, {
    get(_target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined
      return lazyHiveApi([...path, prop])
    },
    apply(_target, _thisArg, args) {
      return ensureClient().then((client) => {
        let receiver: any = client
        for (let i = 0; i < path.length - 1; i++) {
          receiver = receiver[path[i]]
        }
        const methodName = path[path.length - 1]
        const method = methodName === undefined ? receiver : receiver[methodName]
        return withTimeout(
          method.apply(receiver, args),
          HIVE_RPC_TIMEOUT_MS,
          `HiveClient timed out: ${String(methodName ?? "call")}`,
        )
      })
    },
  })
}

const HiveClient = lazyHiveApi() as Client

export default HiveClient
