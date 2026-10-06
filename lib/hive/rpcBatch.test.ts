import { describe, it, expect, vi } from 'vitest';
import {
  RpcCoalescer,
  matchBatchResponses,
  buildRpcRequest,
  isBroadcastCall,
  type JsonRpcRequest,
} from './rpcBatch';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createHarness(maxBatchSize?: number) {
  const sendSingle = vi.fn(async (_api: string, _method: string, params: unknown) => ({ single: params }));
  const sendBatch = vi.fn(async (requests: JsonRpcRequest[]) => (
    requests.map((request) => ({ jsonrpc: '2.0', id: request.id, result: { method: request.method, params: request.params } }))
  ));
  let flush: (() => void | Promise<void>) | null = null;
  const coalescer = new RpcCoalescer({
    sendSingle,
    sendBatch,
    maxBatchSize,
    schedule: (fn) => { flush = fn; },
  });
  return {
    coalescer,
    sendSingle,
    sendBatch,
    async drain() {
      const run = flush;
      flush = null;
      if (!run) throw new Error('nothing was scheduled');
      await run();
    },
  };
}

describe('matchBatchResponses', () => {
  const requests = [
    buildRpcRequest(4, 'condenser_api', 'get_content', ['a', 'one']),
    buildRpcRequest(9, 'bridge', 'get_community', { name: 'hive-178315' }),
  ];

  it('matches by id when the node returns results out of order', () => {
    const matched = matchBatchResponses(requests, [
      { jsonrpc: '2.0', id: 9, result: { name: 'hive-178315' } },
      { jsonrpc: '2.0', id: 4, result: { author: 'a' } },
    ]);
    expect(matched[0]).toEqual({ id: 4, result: { author: 'a' } });
    expect(matched[1]).toEqual({ id: 9, result: { name: 'hive-178315' } });
  });

  it('keeps a per-item error next to a successful sibling', () => {
    const matched = matchBatchResponses(requests, [
      { jsonrpc: '2.0', id: 4, error: { message: 'Post a/one does not exist' } },
      { jsonrpc: '2.0', id: 9, result: { title: 'Snapie' } },
    ]);
    expect(matched[0].error?.message).toMatch(/does not exist/);
    expect(matched[1].result).toEqual({ title: 'Snapie' });
  });

  it('reports a request the node left out', () => {
    const matched = matchBatchResponses(requests, [
      { jsonrpc: '2.0', id: 9, result: { title: 'Snapie' } },
    ]);
    expect(matched[0].error?.message).toMatch(/missing response for id 4/);
    expect(matched[1].result).toEqual({ title: 'Snapie' });
  });

  it('rejects a single-object payload so the caller can retry each call', () => {
    expect(() => matchBatchResponses(requests, { jsonrpc: '2.0', error: { message: 'parse error' }, id: null }))
      .toThrow(/not an array/);
  });
});

describe('RpcCoalescer', () => {
  it('sends one read through the single-call path', async () => {
    const { coalescer, sendSingle, sendBatch, drain } = createHarness();
    const pending = coalescer.call('condenser_api', 'get_content', ['meno', 'post']);
    expect(sendSingle).not.toHaveBeenCalled();
    await drain();
    await expect(pending).resolves.toEqual({ single: ['meno', 'post'] });
    expect(sendSingle).toHaveBeenCalledTimes(1);
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it('collapses distinct reads from the same turn into one batch', async () => {
    const { coalescer, sendSingle, sendBatch, drain } = createHarness();
    const content = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const community = coalescer.call('bridge', 'get_community', { name: 'hive-178315' });
    const other = coalescer.call('condenser_api', 'get_content', ['b', 'two']);
    await drain();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendSingle).not.toHaveBeenCalled();
    const requests = sendBatch.mock.calls[0][0];
    expect(requests.map((request) => request.method)).toEqual([
      'condenser_api.get_content',
      'bridge.get_community',
      'condenser_api.get_content',
    ]);
    expect(new Set(requests.map((request) => request.id)).size).toBe(3);
    await expect(content).resolves.toMatchObject({ method: 'condenser_api.get_content', params: ['a', 'one'] });
    await expect(community).resolves.toMatchObject({ method: 'bridge.get_community' });
    await expect(other).resolves.toMatchObject({ params: ['b', 'two'] });
  });

  it('dedupes identical in-flight calls onto one request', async () => {
    const { coalescer, sendBatch, drain } = createHarness();
    const first = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const second = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const other = coalescer.call('bridge', 'list_community_roles', { community: 'hive-178315' });
    expect(second).toBe(first);
    await drain();
    const requests = sendBatch.mock.calls[0][0];
    expect(requests).toHaveLength(2);
    await expect(first).resolves.toMatchObject({ params: ['a', 'one'] });
    await expect(other).resolves.toBeTruthy();
  });

  it('shares a call that arrives while the request is still in flight, then refetches after it settles', async () => {
    const gate = deferred<unknown>();
    const sendSingle = vi.fn(() => gate.promise);
    const sendBatch = vi.fn(async () => []);
    let flush: (() => void | Promise<void>) | null = null;
    const coalescer = new RpcCoalescer({
      sendSingle,
      sendBatch,
      schedule: (fn) => { flush = fn; },
    });

    const first = coalescer.call('condenser_api', 'get_dynamic_global_properties');
    const run = flush!;
    flush = null;
    const sending = run();
    const during = coalescer.call('condenser_api', 'get_dynamic_global_properties');
    expect(during).toBe(first);
    expect(sendSingle).toHaveBeenCalledTimes(1);

    gate.resolve({ head: 1 });
    await sending;
    await expect(first).resolves.toEqual({ head: 1 });

    const again = coalescer.call('condenser_api', 'get_dynamic_global_properties');
    expect(again).not.toBe(first);
    await flush!();
    expect(sendSingle).toHaveBeenCalledTimes(2);
  });

  it('rejects only the item that failed and resolves the rest', async () => {
    const { coalescer, sendBatch, drain } = createHarness();
    sendBatch.mockResolvedValueOnce([
      { jsonrpc: '2.0', id: 1, error: { message: 'Post a/one does not exist' } },
      { jsonrpc: '2.0', id: 2, result: { title: 'Snapie' } },
    ]);
    const missing = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const community = coalescer.call('bridge', 'get_community', { name: 'hive-178315' });
    await drain();
    await expect(missing).rejects.toThrow(/does not exist/);
    await expect(community).resolves.toEqual({ title: 'Snapie' });
  });

  it('rejects a call the batch response omitted', async () => {
    const { coalescer, sendBatch, drain } = createHarness();
    sendBatch.mockResolvedValueOnce([
      { jsonrpc: '2.0', id: 2, result: { ok: true } },
    ]);
    const missing = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const present = coalescer.call('bridge', 'get_community', { name: 'hive-178315' });
    await drain();
    await expect(missing).rejects.toThrow(/missing response for id 1/);
    await expect(present).resolves.toEqual({ ok: true });
  });

  it('retries each call alone when the response is not a batch array', async () => {
    const { coalescer, sendSingle, sendBatch, drain } = createHarness();
    sendBatch.mockResolvedValueOnce({ jsonrpc: '2.0', id: null, error: { message: 'parse error' } });
    const first = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const second = coalescer.call('condenser_api', 'get_content', ['b', 'two']);
    await drain();
    expect(sendSingle).toHaveBeenCalledTimes(2);
    await expect(first).resolves.toEqual({ single: ['a', 'one'] });
    await expect(second).resolves.toEqual({ single: ['b', 'two'] });
  });

  it('rejects every call in the batch when the transport fails', async () => {
    const { coalescer, sendSingle, sendBatch, drain } = createHarness();
    sendBatch.mockRejectedValueOnce(new Error('Hive RPC batch failed: 503'));
    const first = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const second = coalescer.call('bridge', 'get_community', { name: 'hive-178315' });
    await drain();
    expect(sendSingle).not.toHaveBeenCalled();
    await expect(first).rejects.toThrow(/503/);
    await expect(second).rejects.toThrow(/503/);
  });

  it('does not batch broadcasts, and does not wait for the read flush', async () => {
    const { coalescer, sendSingle, sendBatch, drain } = createHarness();
    const broadcast = coalescer.call('condenser_api', 'broadcast_transaction', [{ signatures: [] }]);
    expect(isBroadcastCall('network_broadcast_api', 'broadcast_transaction')).toBe(true);
    expect(sendSingle).toHaveBeenCalledWith('condenser_api', 'broadcast_transaction', [{ signatures: [] }]);
    expect(sendBatch).not.toHaveBeenCalled();
    const read = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    await drain();
    expect(sendBatch).not.toHaveBeenCalled();
    await expect(broadcast).resolves.toEqual({ single: [{ signatures: [] }] });
    await expect(read).resolves.toEqual({ single: ['a', 'one'] });
    expect(sendSingle).toHaveBeenCalledTimes(2);
  });

  it('does not hold a per-snap lookup behind a discussion fetch', async () => {
    const { coalescer, sendSingle, sendBatch, drain } = createHarness();
    const heavy = coalescer.call('condenser_api', 'get_discussions_by_comments', [{ start_author: 'meno', start_permlink: '', limit: 20 }]);
    const content = coalescer.call('condenser_api', 'get_content', ['a', 'one']);
    const other = coalescer.call('condenser_api', 'get_content', ['b', 'two']);
    expect(sendSingle).toHaveBeenCalledTimes(1);
    expect(sendSingle.mock.calls[0][1]).toBe('get_discussions_by_comments');
    await drain();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0][0].map((request) => request.method)).toEqual([
      'condenser_api.get_content',
      'condenser_api.get_content',
    ]);
    await expect(heavy).resolves.toEqual({ single: [{ start_author: 'meno', start_permlink: '', limit: 20 }] });
    await expect(content).resolves.toMatchObject({ params: ['a', 'one'] });
    await expect(other).resolves.toMatchObject({ params: ['b', 'two'] });
  });

  it('dedupes an in-flight discussion fetch without batching it', async () => {
    const gate = deferred<unknown>();
    const sendSingle = vi.fn(() => gate.promise);
    const sendBatch = vi.fn(async () => []);
    const coalescer = new RpcCoalescer({ sendSingle, sendBatch, schedule: () => {} });
    const first = coalescer.call('condenser_api', 'get_ranked_posts', { sort: 'created', limit: 8 });
    const second = coalescer.call('condenser_api', 'get_ranked_posts', { sort: 'created', limit: 8 });
    expect(second).toBe(first);
    expect(sendSingle).toHaveBeenCalledTimes(1);
    expect(sendBatch).not.toHaveBeenCalled();
    gate.resolve({ posts: [] });
    await expect(first).resolves.toEqual({ posts: [] });
  });

  it('splits a turn that exceeds the batch size into several requests', async () => {
    const { coalescer, sendBatch, sendSingle, drain } = createHarness(2);
    const pending = [
      coalescer.call('condenser_api', 'get_content', ['a', '1']),
      coalescer.call('condenser_api', 'get_content', ['b', '2']),
      coalescer.call('condenser_api', 'get_content', ['c', '3']),
    ];
    await drain();
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0][0]).toHaveLength(2);
    expect(sendSingle).toHaveBeenCalledTimes(1);
    await Promise.all(pending);
  });
});
