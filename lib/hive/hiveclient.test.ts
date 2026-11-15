import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// hiveclient.tsx branches on `typeof window === 'undefined'` at module load
// to decide browser vs. server startup. Force the browser branch so module
// evaluation is synchronous — the server branch kicks off a real
// fetchHealthyNodes() beacon fetch as a fire-and-forget side effect, which
// would need its own mocking and isn't what this file is testing.
(global as any).window = { location: { origin: 'http://localhost:3000' } };

const callMock = vi.fn();
const sendOperationsMock = vi.fn();

vi.mock('@hiveio/dhive', () => ({
  Client: vi.fn().mockImplementation(function MockClient(this: any) {
    this.call = (...args: unknown[]) => callMock(...args);
    this.broadcast = { sendOperations: (...args: unknown[]) => sendOperationsMock(...args) };
  }),
}));

const fetchMock = vi.fn();
(global as any).fetch = (...args: unknown[]) => fetchMock(...args);

function rpcReply(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

let HiveClient: typeof import('./hiveclient').default;
let HIVE_RPC_TIMEOUT_MS: number;

beforeEach(async () => {
  vi.resetModules();
  callMock.mockReset();
  sendOperationsMock.mockReset();
  fetchMock.mockReset();
  const mod = await import('./hiveclient');
  HiveClient = mod.default;
  HIVE_RPC_TIMEOUT_MS = mod.HIVE_RPC_TIMEOUT_MS;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HiveClient — automatic timeout wrapping', () => {
  it('rejects a plain read that never settles, once the timeout elapses', async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {})); // never resolves/rejects
    const pending = HiveClient.call('bridge', 'some_method', {});
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(HIVE_RPC_TIMEOUT_MS);
    await assertion;
  });

  it('also wraps calls found on a sub-object, proving the proxy recurses', async () => {
    sendOperationsMock.mockImplementationOnce(() => new Promise(() => {}));
    const pending = HiveClient.broadcast.sendOperations([], {} as never);
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(HIVE_RPC_TIMEOUT_MS);
    await assertion;
  });

  it('does not fire the timeout after a sub-object call already resolved', async () => {
    sendOperationsMock.mockResolvedValueOnce({ id: 'tx' });
    const result = await HiveClient.broadcast.sendOperations([], {} as never);
    expect(result).toEqual({ id: 'tx' });
    // If the timer weren't cleared on settle, this would be a dangling timer
    // still armed — advancing past it here should be a no-op either way.
    await vi.advanceTimersByTimeAsync(HIVE_RPC_TIMEOUT_MS);
  });
});

describe('HiveClient — plain browser reads skip dhive', () => {
  it('sends HiveClient.call straight to /api/hive-rpc without loading dhive', async () => {
    const { Client } = await import('@hiveio/dhive');
    vi.mocked(Client).mockClear();
    fetchMock.mockImplementationOnce(() => rpcReply({ jsonrpc: '2.0', id: 1, result: { name: 'hive-1' } }));
    const result = await HiveClient.call('bridge', 'get_community', { name: 'hive-1' });
    expect(result).toEqual({ name: 'hive-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/hive-rpc');
    expect(JSON.parse(init.body)).toMatchObject({ method: 'bridge.get_community', params: { name: 'hive-1' } });
    expect(Client).not.toHaveBeenCalled();
    expect(callMock).not.toHaveBeenCalled();
  });

  it('maps database.call to condenser_api', async () => {
    fetchMock.mockImplementationOnce(() => rpcReply({ jsonrpc: '2.0', id: 1, result: { author: 'a' } }));
    await HiveClient.database.call('get_content', ['a', 'p']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      method: 'condenser_api.get_content',
      params: ['a', 'p'],
    });
  });

  it('maps the getAccounts and getDiscussions wrappers the way dhive does', async () => {
    fetchMock.mockImplementation(() => rpcReply({ jsonrpc: '2.0', id: 1, result: [] }));
    await HiveClient.database.getAccounts(['alice']);
    await HiveClient.database.getDiscussions('trending', { tag: 'hive', limit: 5 });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toMatchObject({ method: 'condenser_api.get_accounts', params: [['alice']] });
    expect(bodies[1]).toMatchObject({
      method: 'condenser_api.get_discussions_by_trending',
      params: [{ tag: 'hive', limit: 5 }],
    });
  });

  it('throws an RPCError-shaped error for a JSON-RPC error reply', async () => {
    fetchMock.mockImplementationOnce(() => rpcReply({
      jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Assert Exception', data: { name: 'assert_exception' } },
    }));
    await expect(HiveClient.call('bridge', 'get_post', {})).rejects.toMatchObject({
      name: 'RPCError',
      message: 'Assert Exception',
      jse_info: { name: 'assert_exception' },
    });
  });

  it('retries once when the request itself fails', async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementationOnce(() => rpcReply({ jsonrpc: '2.0', id: 1, result: 42 }));
    const pending = HiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
    await vi.advanceTimersByTimeAsync(600);
    await expect(pending).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still sends broadcasts through dhive', async () => {
    callMock.mockResolvedValueOnce({ id: 'tx' });
    await expect(HiveClient.call('condenser_api', 'broadcast_transaction', [{}])).resolves.toEqual({ id: 'tx' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
