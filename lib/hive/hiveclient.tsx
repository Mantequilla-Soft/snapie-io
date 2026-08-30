import { Client } from "@hiveio/dhive"
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
// await) forever. Longer than /api/hive-rpc's own worst case — nodes raced
// in parallel with a shared 9s budget, plus up to 4s for a stale beacon-node
// refresh — so a legitimately slow multi-node fallback isn't cut off early;
// this is a hang watchdog, not a normal request timeout.
export const HIVE_RPC_TIMEOUT_MS = 65000

// Proxy object so reassigning .client propagates to all importers
// (export default captures a value, not a binding)
const hive = {
  client: IS_BROWSER
    // Browser: route through our own API proxy — eliminates CORS entirely
    ? new Client([window.location.origin + "/api/hive-rpc"])
    // Server: call Hive nodes directly (no CORS constraints)
    : new Client(filterNodeList(FALLBACK_NODES)),
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
  fetchHealthyNodes().then(nodes => {
    hive.client = new Client(nodes)
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
  hive.client = new Client(nodes)
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
function wrapWithTimeout(getTarget: () => any): any {
  const subProxies = new Map<string | symbol, any>()
  return new Proxy({}, {
    get(_target, prop) {
      const value = Reflect.get(getTarget(), prop)
      if (typeof value === "function") {
        return (...args: any[]) =>
          withTimeout(value.apply(getTarget(), args), HIVE_RPC_TIMEOUT_MS, `HiveClient timed out: ${String(prop)}`)
      }
      if (value !== null && typeof value === "object") {
        if (!subProxies.has(prop)) {
          subProxies.set(prop, wrapWithTimeout(() => Reflect.get(getTarget(), prop)))
        }
        return subProxies.get(prop)
      }
      return value
    },
  })
}

const HiveClient: Client = wrapWithTimeout(() => hive.client)

export default HiveClient
