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

  const nodes = await getHiveRpcNodes()
  const outcome = await dispatchHiveRpc(body, nodes)
  if (!outcome.ok) {
    return NextResponse.json(ALL_NODES_UNREACHABLE, { status: 503 })
  }
  return NextResponse.json(outcome.data)
}
