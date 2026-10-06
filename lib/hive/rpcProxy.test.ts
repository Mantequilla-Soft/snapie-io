import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  ATTEMPT_TIMEOUT_MS,
  FAILURE_COOLDOWN_MS,
  FALLBACK_NODES,
  dispatchHiveRpc,
  getHiveRpcNodes,
  resetRpcProxyState,
  selectBeaconNodes,
} from './rpcProxy'
import { POST } from '@/app/api/hive-rpc/route'

const body = { jsonrpc: '2.0', method: 'condenser_api.get_dynamic_global_properties', params: [], id: 1 }
const A = 'https://nodes.test/a'
const B = 'https://nodes.test/b'
const C = 'https://nodes.test/c'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  resetRpcProxyState()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('dispatchHiveRpc', () => {
  it('fails over in order, then prefers the node that succeeded and skips nodes in cooldown', async () => {
    const calls: string[] = []
    let now = 1_000_000
    const mode = new Map<string, 'throw' | '500' | 'ok'>([
      [A, 'throw'],
      [B, '500'],
      [C, 'ok'],
    ])

    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      const behavior = mode.get(url)
      if (behavior === 'throw') throw new TypeError('fetch failed')
      if (behavior === '500') return jsonResponse({ error: 'down' }, 500)
      return jsonResponse({ jsonrpc: '2.0', result: { ok: true }, id: 1 })
    })

    const first = await dispatchHiveRpc(body, [A, B, C], { fetchImpl, now: () => now })
    expect(first).toEqual({ ok: true, data: { jsonrpc: '2.0', result: { ok: true }, id: 1 } })
    expect(calls).toEqual([A, B, C])

    calls.length = 0
    mode.set(A, 'ok')
    mode.set(B, 'ok')
    now += 1_000
    const second = await dispatchHiveRpc(body, [A, B, C], { fetchImpl, now: () => now })
    expect(second.ok).toBe(true)
    expect(calls).toEqual([C])

    calls.length = 0
    mode.set(C, '500')
    now += FAILURE_COOLDOWN_MS
    const third = await dispatchHiveRpc(body, [A, B, C], { fetchImpl, now: () => now })
    expect(third.ok).toBe(true)
    expect(calls).toEqual([C, A])
  })

  it('returns a JSON-RPC application error without trying the next node', async () => {
    const calls: string[] = []
    const errorBody = { jsonrpc: '2.0', error: { code: -32602, message: 'Invalid params' }, id: 1 }
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (url === A) return jsonResponse(errorBody, 200)
      throw new Error(`unexpected call to ${url}`)
    })

    const outcome = await dispatchHiveRpc(body, [A, B], { fetchImpl })
    expect(outcome).toEqual({ ok: true, data: errorBody })
    expect(calls).toEqual([A])

    calls.length = 0
    const again = await dispatchHiveRpc(body, [A, B], { fetchImpl })
    expect(again).toEqual({ ok: true, data: errorBody })
    expect(calls).toEqual([A])
  })

  it('returns an HTTP 400 JSON-RPC error body without failing over', async () => {
    const calls: string[] = []
    const errorBody = { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: 1 }
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      return jsonResponse(errorBody, 400)
    })

    const outcome = await dispatchHiveRpc(body, [A, B], { fetchImpl })
    expect(outcome).toEqual({ ok: true, data: errorBody })
    expect(calls).toEqual([A])
  })

  it('does not treat an HTTP 5xx JSON-RPC body as an application error', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (url === A) {
        return jsonResponse(
          { jsonrpc: '2.0', error: { code: -32603, message: 'internal' }, id: 1 },
          500,
        )
      }
      return jsonResponse({ jsonrpc: '2.0', result: 1, id: 1 })
    })

    const outcome = await dispatchHiveRpc(body, [A, B], { fetchImpl })
    expect(outcome).toEqual({ ok: true, data: { jsonrpc: '2.0', result: 1, id: 1 } })
    expect(calls).toEqual([A, B])
  })

  it('fails over only after the per-attempt timeout when a node never answers', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      calls.push(url)
      if (url === A) {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          const abort = () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          }
          if (!signal) return
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort)
        })
      }
      return Promise.resolve(jsonResponse({ jsonrpc: '2.0', result: 'from-b', id: 1 }))
    })

    const pending = dispatchHiveRpc(body, [A, B], {
      fetchImpl,
      timeoutMs: ATTEMPT_TIMEOUT_MS,
    })

    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS - 1)
    expect(calls).toEqual([A])

    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toEqual({
      ok: true,
      data: { jsonrpc: '2.0', result: 'from-b', id: 1 },
    })
    expect(calls).toEqual([A, B])
  })
})

describe('node list', () => {
  it('omits the unresolved Ecency host and keeps techcoderx last in the fallback list', () => {
    expect(FALLBACK_NODES.some((node) => node.includes('hapi.ecency.com'))).toBe(false)
    expect(FALLBACK_NODES.at(-1)).toBe('https://techcoderx.com')
    expect(FALLBACK_NODES[0]).not.toBe('https://techcoderx.com')
  })

  it('drops low-score and excluded beacon nodes and demotes techcoderx below healthier ones', () => {
    const selected = selectBeaconNodes([
      { endpoint: 'https://techcoderx.com', score: 100 },
      { endpoint: 'https://api.deathwing.me', score: 100 },
      { endpoint: 'https://hapi.ecency.com', score: 0 },
      { endpoint: 'https://api.hive.blog', score: 90 },
      { endpoint: 'https://api.openhive.network', score: 80 },
    ])
    expect(selected).toEqual([
      'https://api.hive.blog',
      'https://api.openhive.network',
      'https://techcoderx.com',
    ])
  })

  it('uses the fallback list when beacon is unavailable, and caches a good beacon response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }))
    await expect(getHiveRpcNodes(fetchImpl)).resolves.toEqual(FALLBACK_NODES)
    expect(fetchImpl).toHaveBeenCalledOnce()

    resetRpcProxyState()
    const beacon = [
      { endpoint: 'https://api.hive.blog', score: 100 },
      { endpoint: 'https://api.openhive.network', score: 99 },
    ]
    fetchImpl.mockResolvedValue(jsonResponse(beacon))
    await expect(getHiveRpcNodes(fetchImpl)).resolves.toEqual([
      'https://api.hive.blog',
      'https://api.openhive.network',
    ])
    await expect(getHiveRpcNodes(fetchImpl)).resolves.toEqual([
      'https://api.hive.blog',
      'https://api.openhive.network',
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/hive-rpc', () => {
  it('rejects an invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/hive-rpc', {
      method: 'POST',
      body: '{',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
  })

  it('returns the unreachable JSON-RPC error when every node fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const req = new NextRequest('http://localhost/api/hive-rpc', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'All Hive nodes unreachable' },
      id: null,
    })
  })
})
