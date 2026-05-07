import { Client } from "@hiveio/dhive"

const FALLBACK_NODES = [
  "https://api.hive.blog",
  "https://techcoderx.com",
  "https://rpc.mahdiyari.info",
  "https://api.c0ff33a.uk",
]

// Nodes to exclude (CORS issues with snapie.io)
const EXCLUDED_NODE_HOSTS = [
  "api.openhive.network",
  "api.deathwing.me",
]

const BEACON_API = "https://beacon.peakd.com/api/nodes"
const MIN_SCORE = 80

// Proxy object so reassigning .client propagates to all importers
// (export default captures a value, not a binding)
const hive = {
  client: new Client(filterNodeList(FALLBACK_NODES)),
}

function isExcludedNode(endpoint: string): boolean {
  if (!endpoint || typeof endpoint !== "string") return false
  try {
    return EXCLUDED_NODE_HOSTS.includes(new URL(endpoint).hostname)
  } catch {
    return EXCLUDED_NODE_HOSTS.some(host => endpoint.includes(host))
  }
}

/** Dedupe and drop excluded / bad endpoints (defensive: beacon shape changes, stray URLs). */
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

async function fetchHealthyNodes(): Promise<string[]> {
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

// Initialize with healthy nodes on first load (client-side only)
if (typeof window !== "undefined") {
  fetchHealthyNodes().then(nodes => {
    hive.client = new Client(nodes)
    if (process.env.NODE_ENV === "development") {
      console.log("🔗 HiveClient initialized with beacon nodes:", nodes)
    }
  }).catch(err => {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to initialize HiveClient with beacon nodes:", err)
    }
  })
}

// Proxy that delegates all property access to the current hive.client.
// This lets consumers keep `import HiveClient from './hiveclient'`
// and automatically use the updated client after beacon nodes load.
const HiveClient: Client = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    return Reflect.get(hive.client, prop, receiver)
  },
})

export default HiveClient
