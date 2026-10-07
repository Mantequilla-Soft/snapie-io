/**
 * Coalesce browser Hive reads that start in the same turn into one JSON-RPC
 * batch POST against /api/hive-rpc.
 *
 * The feed's vote/payout refresh calls condenser_api.get_content once per
 * visible snap, and the shell fires several small reads at the same time
 * (mutes, community, accounts). Each of those is its own HTTP request today.
 * Hive nodes accept a JSON-RPC array and answer with one array, matched by
 * id, where a single item may carry an error while the rest succeed.
 *
 * Discussion and ranked-post reads stay on their own request. They are
 * large, and folding one into a batch makes every other call wait on it.
 * Broadcasts are never batched or deduped.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number
  method: string
  params: unknown
}

export interface JsonRpcError {
  code?: number
  message?: string
  data?: unknown
}

export interface MatchedRpcResult {
  id: number
  result?: unknown
  error?: JsonRpcError
}

export interface RpcCoalescerOptions {
  sendSingle: (api: string, method: string, params: unknown) => Promise<unknown>
  sendBatch: (requests: JsonRpcRequest[]) => Promise<unknown>
  /** Defaults to queueMicrotask. Tests pass a scheduler they can flush. */
  schedule?: (flush: () => void | Promise<void>) => void
  /** Distinct calls per batch HTTP request. Extra calls go out as further batches. */
  maxBatchSize?: number
}

interface QueueEntry {
  key: string
  api: string
  method: string
  params: unknown
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const DEFAULT_MAX_BATCH = 20

/**
 * Abort a batch POST, and drop a matching in-flight entry, after this long.
 * Browser fetches can hang forever (backgrounded tab, sleep/wake, a proxy
 * that drops an idle connection). HiveClient's 65s watchdog rejects the
 * original caller, but the promise underneath stays pending — and so would
 * this map, so every later identical call joined the dead one. The entry
 * expires with the abort and cannot outlive it; a retry then sends fresh.
 */
export const HIVE_RPC_BATCH_TIMEOUT_MS = 30_000

/** List-shaped condenser/bridge reads. Sent alone so a fat container or
 *  ranked-post page does not delay the small calls that started with it. */
const HEAVY_METHODS = new Set([
  "get_discussions_by_author_before_date",
  "get_discussions_by_comments",
  "get_discussions_by_created",
  "get_discussions_by_trending",
  "get_discussions_by_blog",
  "get_discussions_by_feed",
  "get_discussions_by_hot",
  "get_content_replies",
  "get_ranked_posts",
  "get_account_posts",
  "get_state",
  "get_account_history",
])

export function isBroadcastCall(api: string, method: string): boolean {
  return api === "network_broadcast_api" || method.startsWith("broadcast_")
}

export function shouldCoalesce(api: string, method: string): boolean {
  if (isBroadcastCall(api, method)) return false
  if (HEAVY_METHODS.has(method)) return false
  return true
}

export function rpcCacheKey(api: string, method: string, params: unknown): string {
  return JSON.stringify([api, method, params])
}

export function buildRpcRequest(id: number, api: string, method: string, params: unknown): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: `${api}.${method}`,
    params,
  }
}

/**
 * Pair a batch response with the requests that produced it.
 * Match by id — node order is not part of the contract. A non-array payload
 * is a whole-batch failure (the node did not speak batches); the caller
 * retries each request on its own.
 */
export function matchBatchResponses(requests: JsonRpcRequest[], payload: unknown): MatchedRpcResult[] {
  if (!Array.isArray(payload)) {
    throw new Error("Hive RPC batch response was not an array")
  }
  const byId = new Map<number, { result?: unknown; error?: JsonRpcError }>()
  for (const item of payload) {
    if (!item || typeof item !== "object") continue
    const id = (item as { id?: unknown }).id
    if (typeof id !== "number") continue
    const error = (item as { error?: JsonRpcError }).error
    if (error) {
      byId.set(id, { error })
    } else {
      byId.set(id, { result: (item as { result?: unknown }).result })
    }
  }
  return requests.map((request) => {
    const matched = byId.get(request.id)
    if (!matched) {
      return { id: request.id, error: { message: `Hive RPC batch missing response for id ${request.id}` } }
    }
    return { id: request.id, ...matched }
  })
}

export class RpcCoalescer {
  private queue: QueueEntry[] = []
  private inflight = new Map<string, Promise<unknown>>()
  private scheduled = false
  private nextId = 1
  private readonly schedule: (flush: () => void | Promise<void>) => void
  private readonly maxBatchSize: number

  constructor(private readonly options: RpcCoalescerOptions) {
    this.schedule = options.schedule ?? ((flush) => queueMicrotask(() => { void flush() }))
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH
  }

  call(api: string, method: string, params?: unknown): Promise<unknown> {
    const normalized = params === undefined ? [] : params
    if (isBroadcastCall(api, method)) {
      return this.options.sendSingle(api, method, normalized)
    }

    const key = rpcCacheKey(api, method, normalized)
    const existing = this.inflight.get(key)
    if (existing) return existing

    // Large reads start immediately. Identical ones already in flight still
    // share the promise above, so two mounts don't pay for the same list twice.
    if (!shouldCoalesce(api, method)) {
      const promise = this.options.sendSingle(api, method, normalized)
      this.track(key, promise)
      return promise
    }

    let resolve!: (value: unknown) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res
      reject = rej
    })
    this.track(key, promise)
    this.queue.push({ key, api, method, params: normalized, resolve, reject })
    this.scheduleFlush()
    return promise
  }

  private track(key: string, promise: Promise<unknown>) {
    this.inflight.set(key, promise)
    const timer = setTimeout(() => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key)
    }, HIVE_RPC_BATCH_TIMEOUT_MS)
    const clear = () => {
      clearTimeout(timer)
      if (this.inflight.get(key) === promise) this.inflight.delete(key)
    }
    promise.then(clear, clear)
  }

  private scheduleFlush() {
    if (this.scheduled) return
    this.scheduled = true
    this.schedule(() => {
      this.scheduled = false
      const entries = this.queue.splice(0, this.queue.length)
      return this.dispatch(entries)
    })
  }

  private async dispatch(entries: QueueEntry[]) {
    if (entries.length === 0) return
    if (entries.length === 1) {
      await this.settleSingle(entries[0])
      return
    }
    const chunks: QueueEntry[][] = []
    for (let i = 0; i < entries.length; i += this.maxBatchSize) {
      chunks.push(entries.slice(i, i + this.maxBatchSize))
    }
    await Promise.all(chunks.map((chunk) => (
      chunk.length === 1 ? this.settleSingle(chunk[0]) : this.settleBatch(chunk)
    )))
  }

  private async settleSingle(entry: QueueEntry) {
    try {
      entry.resolve(await this.options.sendSingle(entry.api, entry.method, entry.params))
    } catch (error) {
      entry.reject(error)
    }
  }

  private async settleBatch(entries: QueueEntry[]) {
    const requests = entries.map((entry) => buildRpcRequest(this.nextId++, entry.api, entry.method, entry.params))
    let payload: unknown
    try {
      payload = await this.options.sendBatch(requests)
    } catch (error) {
      entries.forEach((entry) => entry.reject(error))
      return
    }

    let matched: MatchedRpcResult[]
    try {
      matched = matchBatchResponses(requests, payload)
    } catch {
      // The node answered with a single object instead of a batch array.
      // Retry each read alone so a node that does not speak batches still works.
      await Promise.all(entries.map((entry) => this.settleSingle(entry)))
      return
    }

    matched.forEach((item, index) => {
      const entry = entries[index]
      if (item.error) {
        entry.reject(new Error(item.error.message || "Hive RPC error"))
        return
      }
      entry.resolve(item.result)
    })
  }
}

/** Browser HiveClient only. Replaces Client.call so database.call (which
 *  dhive binds to the same instance) joins the coalescer. Single reads still
 *  go through dhive, which keeps the proxy's existing failover for a call
 *  that has nobody to share a request with. */
export function installBrowserRpcCoalescer(client: { call: (...args: any[]) => Promise<any> }, endpoint: string) {
  const sendSingle = client.call.bind(client)
  const coalescer = new RpcCoalescer({
    sendSingle,
    sendBatch: (requests) => postHiveRpc(endpoint, requests),
  })
  client.call = (api: string, method: string, params?: unknown) => coalescer.call(api, method, params)
}

export async function postHiveRpc(endpoint: string, body: unknown): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HIVE_RPC_BATCH_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-cache",
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Hive RPC batch failed: ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Hive RPC batch timed out after ${HIVE_RPC_BATCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
