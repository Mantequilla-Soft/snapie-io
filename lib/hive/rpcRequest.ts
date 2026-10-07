/** Public cap. The browser coalescer sends at most 20; anything larger is
 *  rejected here so a node 413/4xx cannot bench healthy nodes for everyone. */
export const MAX_HIVE_RPC_BATCH = 50

function rpcItemError(item: unknown): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return 'Malformed Hive RPC request'
  }
  const record = item as Record<string, unknown>
  if (record.jsonrpc !== '2.0') return 'Malformed Hive RPC request'
  if (typeof record.method !== 'string' || record.method.length === 0) {
    return 'Malformed Hive RPC request'
  }
  if (
    'id' in record &&
    record.id !== null &&
    typeof record.id !== 'number' &&
    typeof record.id !== 'string'
  ) {
    return 'Malformed Hive RPC request'
  }
  if (record.params !== undefined) {
    const params = record.params
    const paramsOk = Array.isArray(params) || (typeof params === 'object' && params !== null)
    if (!paramsOk) return 'Malformed Hive RPC request'
  }
  return null
}

/** Null when `body` is one JSON-RPC call or a batch the route will relay. */
export function hiveRpcRequestError(body: unknown): string | null {
  if (!Array.isArray(body)) return rpcItemError(body)
  if (body.length > MAX_HIVE_RPC_BATCH) {
    return `Hive RPC batch exceeds ${MAX_HIVE_RPC_BATCH} calls`
  }
  if (body.length === 0) return 'Malformed Hive RPC request'
  for (const item of body) {
    const error = rpcItemError(item)
    if (error) return error
  }
  return null
}
