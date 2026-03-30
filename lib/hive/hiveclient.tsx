import { Client } from "@hiveio/dhive"

const FALLBACK_NODES = [
  "https://api.hive.blog",
  "https://api.openhive.network",
  "https://techcoderx.com",
  "https://rpc.mahdiyari.info",
  "https://api.c0ff33a.uk",
]

// Nodes to exclude (CORS issues with snapie.io)
const EXCLUDED_NODES = [
  "api.deathwing.me",
]

const BEACON_API = "https://beacon.peakd.com/api/nodes"
const MIN_SCORE = 80

// Proxy object so reassigning .client propagates to all importers
// (export default captures a value, not a binding)
const hive = {
  client: new Client(FALLBACK_NODES),
}

async function fetchHealthyNodes(): Promise<string[]> {
  try {
    const res = await fetch(BEACON_API)
    if (!res.ok) return FALLBACK_NODES

    const nodes: Array<{ endpoint: string; score: number; name: string }> = await res.json()

    const healthy = nodes
      .filter(n => n.score >= MIN_SCORE)
      .filter(n => !EXCLUDED_NODES.some(ex => n.name.includes(ex)))
      .sort((a, b) => b.score - a.score)
      .map(n => n.endpoint)

    return healthy.length >= 2 ? healthy : FALLBACK_NODES
  } catch {
    return FALLBACK_NODES
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
