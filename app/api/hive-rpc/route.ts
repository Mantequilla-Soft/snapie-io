import { NextRequest, NextResponse } from 'next/server'
import {
  ALL_NODES_UNREACHABLE,
  dispatchHiveRpc,
  getHiveRpcNodes,
} from '@/lib/hive/rpcProxy'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // `body` is either one JSON-RPC object or a batch array. Both are forwarded
  // unchanged. Node choice stays in the proxy: one node at a time, failing
  // over only when that node is unhealthy. A batch response is an array that
  // may mix results and per-item errors; that array is the success payload.
  // Do not collapse a partial item error into a 503.
  const nodes = await getHiveRpcNodes()
  const outcome = await dispatchHiveRpc(body, nodes)
  if (!outcome.ok) {
    return NextResponse.json(ALL_NODES_UNREACHABLE, { status: 503 })
  }
  return NextResponse.json(outcome.data)
}
