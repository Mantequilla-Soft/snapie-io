import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// hiveclient.tsx branches on `typeof window === 'undefined'` at module load
// to decide browser vs. server startup. Force the browser branch so module
// evaluation is synchronous — the server branch kicks off a real
// fetchHealthyNodes() beacon fetch as a fire-and-forget side effect, which
// would need its own mocking and isn't what this file is testing.
(global as any).window = { location: { origin: 'http://localhost:3000' } };

const callMock = vi.fn();
const getAccountsMock = vi.fn();

vi.mock('@hiveio/dhive', () => ({
  Client: vi.fn().mockImplementation(function MockClient(this: any) {
    this.call = (...args: unknown[]) => callMock(...args);
    this.database = { getAccounts: (...args: unknown[]) => getAccountsMock(...args) };
  }),
}));

let HiveClient: typeof import('./hiveclient').default;
let HIVE_RPC_TIMEOUT_MS: number;

beforeEach(async () => {
  vi.resetModules();
  callMock.mockReset();
  getAccountsMock.mockReset();
  const mod = await import('./hiveclient');
  HiveClient = mod.default;
  HIVE_RPC_TIMEOUT_MS = mod.HIVE_RPC_TIMEOUT_MS;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HiveClient — automatic timeout wrapping', () => {
  it('passes through a normal fast-resolving top-level call untouched', async () => {
    callMock.mockResolvedValueOnce({ ok: true });
    const result = await HiveClient.call('bridge', 'some_method', {});
    expect(result).toEqual({ ok: true });
  });

  it('rejects a top-level call that never settles, once the timeout elapses', async () => {
    callMock.mockImplementationOnce(() => new Promise(() => {})); // never resolves/rejects
    const pending = HiveClient.call('bridge', 'some_method', {});
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(HIVE_RPC_TIMEOUT_MS);
    await assertion;
  });

  it('also wraps calls found on a sub-object, proving the proxy recurses', async () => {
    getAccountsMock.mockImplementationOnce(() => new Promise(() => {}));
    const pending = HiveClient.database.getAccounts(['meno']);
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(HIVE_RPC_TIMEOUT_MS);
    await assertion;
  });

  it('does not fire the timeout after a sub-object call already resolved', async () => {
    getAccountsMock.mockResolvedValueOnce([{ name: 'meno' }]);
    const result = await HiveClient.database.getAccounts(['meno']);
    expect(result).toEqual([{ name: 'meno' }]);
    // If the timer weren't cleared on settle, this would be a dangling timer
    // still armed — advancing past it here should be a no-op either way.
    await vi.advanceTimersByTimeAsync(HIVE_RPC_TIMEOUT_MS);
  });
});
