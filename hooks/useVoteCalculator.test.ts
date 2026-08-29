import { describe, it, expect, vi, beforeEach } from 'vitest';

// useVoteCalculator caches fetched data at module scope (globalsCache,
// accountCache, globalsFetchPromise), so each test dynamically re-imports
// the module after vi.resetModules() to start from a clean cache — same
// isolation concern as muted-accounts.test.ts.

const databaseCallMock = vi.fn();
const getAccountsMock = vi.fn();

vi.mock('@/lib/hive/hiveclient', () => ({
  default: {
    database: {
      call: (...args: unknown[]) => databaseCallMock(...args),
      getAccounts: (...args: unknown[]) => getAccountsMock(...args),
    },
  },
}));

const REWARD_FUND = { recent_claims: '1000000000000', reward_balance: '50000.000 HIVE' };
const PRICE_DATA = { base: '0.250 HBD', quote: '1.000 HIVE' };
const ACCOUNT = { vesting_shares: '1000000.000000 VESTS', received_vesting_shares: '0.000000 VESTS', delegated_vesting_shares: '0.000000 VESTS' };

function mockHappyPath() {
  databaseCallMock.mockImplementation((method: string) => {
    if (method === 'get_reward_fund') return Promise.resolve(REWARD_FUND);
    if (method === 'get_current_median_history_price') return Promise.resolve(PRICE_DATA);
    return Promise.resolve(null);
  });
  getAccountsMock.mockResolvedValue([ACCOUNT]);
}

async function freshCalculateDelta(username: string | null) {
  vi.resetModules();
  const { useVoteCalculator } = await import('./useVoteCalculator');
  return useVoteCalculator(username).calculateDelta;
}

beforeEach(() => {
  databaseCallMock.mockReset();
  getAccountsMock.mockReset();
});

describe('useVoteCalculator.calculateDelta', () => {
  it('resolves to a nonzero value on the very first call — no race with an unresolved mount effect', async () => {
    // This is the bug being fixed: calculateDelta used to read off React
    // state populated by a fire-and-forget effect, so a vote cast before
    // that effect resolved got a permanent $0.00 optimistic delta even
    // though the heart icon (separate, unrelated state) already flipped.
    // Calling it immediately after construction, with no time for an
    // effect to have run, is exactly that scenario.
    mockHappyPath();
    const calculateDelta = await freshCalculateDelta('meno');
    const delta = await calculateDelta(100);
    expect(delta).toBeGreaterThan(0);
  });

  it('returns 0 without calling the API when no username is given', async () => {
    mockHappyPath();
    const calculateDelta = await freshCalculateDelta(null);
    const delta = await calculateDelta(100);
    expect(delta).toBe(0);
    expect(databaseCallMock).not.toHaveBeenCalled();
    expect(getAccountsMock).not.toHaveBeenCalled();
  });

  it('returns 0 instead of throwing when the underlying fetch fails', async () => {
    databaseCallMock.mockRejectedValue(new Error('node unreachable'));
    getAccountsMock.mockResolvedValue([ACCOUNT]);
    const calculateDelta = await freshCalculateDelta('meno');
    await expect(calculateDelta(100)).resolves.toBe(0);
  });

  it('returns 0 when the account is not found', async () => {
    mockHappyPath();
    getAccountsMock.mockResolvedValue([]);
    const calculateDelta = await freshCalculateDelta('ghost');
    await expect(calculateDelta(100)).resolves.toBe(0);
  });

  it('caches globals and account — a second call does not refetch', async () => {
    mockHappyPath();
    const calculateDelta = await freshCalculateDelta('meno');
    await calculateDelta(100);
    const callsAfterFirst = databaseCallMock.mock.calls.length + getAccountsMock.mock.calls.length;
    await calculateDelta(50);
    expect(databaseCallMock.mock.calls.length + getAccountsMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('scales roughly with vote weight', async () => {
    mockHappyPath();
    const calculateDelta = await freshCalculateDelta('meno');
    const full = await calculateDelta(100);
    const half = await calculateDelta(50);
    expect(half).toBeCloseTo(full / 2, 5);
  });
});
