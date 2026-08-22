import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mocking idiom as rouletteService.test.ts: an in-memory array per
// source, with find().sort().limit().lean() as a chainable fake.

interface FakeLedgerRow { username: string; actionType: string; points: number; createdAt: Date; }
interface FakeSpinRow { username: string; multiplier: number; stake: number; payout: number; createdAt: Date; }
interface FakeBadgeRow { username: string; sku: string; price: number; createdAt: Date; }

let ledgerStore: FakeLedgerRow[] = [];
let spinStore: FakeSpinRow[] = [];
let badgeStore: FakeBadgeRow[] = [];

vi.mock('@/lib/db/mongodb', () => ({
  connectDB: vi.fn(async () => {}),
}));

function fakeFind<T extends { username: string; createdAt: Date }>(store: T[]) {
  return (filter: { username: string }) => {
    const chain = {
      sort: () => chain,
      limit: (n: number) => ({
        lean: async () =>
          store
            .filter(r => r.username === filter.username)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, n),
      }),
    };
    return chain;
  };
}

vi.mock('@/lib/db/models/PointsLedger', () => ({
  PointsLedger: { find: (filter: { username: string }) => fakeFind(ledgerStore)(filter) },
}));
vi.mock('@/lib/db/models/RouletteSpin', () => ({
  RouletteSpin: { find: (filter: { username: string }) => fakeFind(spinStore)(filter) },
}));
vi.mock('@/lib/db/models/MoodBadgePurchase', () => ({
  MoodBadgePurchase: { find: (filter: { username: string }) => fakeFind(badgeStore)(filter) },
}));

beforeEach(() => {
  ledgerStore = [];
  spinStore = [];
  badgeStore = [];
});

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

describe('getRecentTransactions', () => {
  it('normalizes each PointsLedger earn actionType with a distinct label', async () => {
    for (const [actionType, points] of [['blog', 10], ['snap', 3], ['comment', 2], ['reblog', 2], ['vote', 1]] as const) {
      ledgerStore.push({ username: 'alice', actionType, points, createdAt: daysAgo(1) });
    }
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result).toHaveLength(5);
    expect(result.find(t => t.label === 'Earned for a blog post')?.delta).toBe(10);
    expect(result.find(t => t.label === 'Earned for a snap')?.delta).toBe(3);
    expect(result.find(t => t.label === 'Earned for a comment')?.delta).toBe(2);
    expect(result.find(t => t.label === 'Earned for a reblog')?.delta).toBe(2);
    expect(result.find(t => t.label === 'Earned for a vote')?.delta).toBe(1);
    expect(result.every(t => t.type === 'earn')).toBe(true);
  });

  it('normalizes a purchase and an admin grant', async () => {
    ledgerStore.push({ username: 'alice', actionType: 'purchase', points: 500, createdAt: daysAgo(2) });
    ledgerStore.push({ username: 'alice', actionType: 'admin_grant', points: 1000, createdAt: daysAgo(3) });
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result.find(t => t.type === 'purchase')).toMatchObject({ label: 'Bought points with HBD', delta: 500 });
    expect(result.find(t => t.type === 'admin_grant')).toMatchObject({ label: 'Points grant', delta: 1000 });
  });

  it('normalizes a roulette loss as a negative delta of the stake', async () => {
    spinStore.push({ username: 'alice', multiplier: 0, stake: 100, payout: 0, createdAt: daysAgo(1) });
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result[0]).toMatchObject({ type: 'roulette', label: 'Roulette spin — lost', delta: -100 });
  });

  it('normalizes a roulette win as one net delta line, not two', async () => {
    spinStore.push({ username: 'alice', multiplier: 5, stake: 100, payout: 500, createdAt: daysAgo(1) });
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'roulette', label: 'Roulette spin — 5x', delta: 400 });
  });

  it('resolves a badge purchase label through the MOOD_BADGES catalog, not the raw sku', async () => {
    badgeStore.push({ username: 'alice', sku: 'bull', price: 500, createdAt: daysAgo(1) });
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result[0]).toMatchObject({ type: 'badge_purchase', label: 'Bought Bull badge', delta: -500 });
  });

  it('falls back to the raw sku if the catalog entry is missing', async () => {
    badgeStore.push({ username: 'alice', sku: 'retired_sku', price: 500, createdAt: daysAgo(1) });
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result[0].label).toBe('Bought retired_sku badge');
  });

  it('merges all three sources in strict createdAt-descending order', async () => {
    ledgerStore.push({ username: 'alice', actionType: 'blog', points: 10, createdAt: daysAgo(5) });
    spinStore.push({ username: 'alice', multiplier: 0, stake: 50, payout: 0, createdAt: daysAgo(2) });
    badgeStore.push({ username: 'alice', sku: 'bull', price: 500, createdAt: daysAgo(8) });
    spinStore.push({ username: 'alice', multiplier: 2, stake: 50, payout: 100, createdAt: daysAgo(1) });
    ledgerStore.push({ username: 'alice', actionType: 'purchase', points: 200, createdAt: daysAgo(4) });

    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    const order = result.map(t => t.createdAt.getTime());
    expect(order).toEqual([...order].sort((a, b) => b - a));
    expect(result[0].label).toBe('Roulette spin — 2x'); // most recent (1 day ago)
    expect(result[result.length - 1].label).toBe('Bought Bull badge'); // oldest (8 days ago)
  });

  it('truncates to the true N most recent overall, not N per source', async () => {
    for (let i = 0; i < 3; i++) ledgerStore.push({ username: 'alice', actionType: 'vote', points: 1, createdAt: daysAgo(10 + i) });
    for (let i = 0; i < 3; i++) spinStore.push({ username: 'alice', multiplier: 0, stake: 10, payout: 0, createdAt: daysAgo(20 + i) });
    for (let i = 0; i < 3; i++) badgeStore.push({ username: 'alice', sku: 'bull', price: 500, createdAt: daysAgo(30 + i) });

    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 5);
    expect(result).toHaveLength(5);
    // The 5 most recent overall are all 3 ledger rows plus the 2 newest spin rows.
    expect(result.filter(t => t.type === 'earn')).toHaveLength(3);
    expect(result.filter(t => t.type === 'roulette')).toHaveLength(2);
    expect(result.filter(t => t.type === 'badge_purchase')).toHaveLength(0);
  });

  it('would silently drop real entries if a source were under-fetched — regression guard for the per-source limit', async () => {
    // All 10 most-recent overall transactions come from ONE source
    // (roulette). If limit were ever split 3 ways (~3-4 per source) instead
    // of applied in full to each source, this would come back short.
    for (let i = 0; i < 10; i++) {
      spinStore.push({ username: 'alice', multiplier: 0, stake: 10, payout: 0, createdAt: daysAgo(i) });
    }
    ledgerStore.push({ username: 'alice', actionType: 'blog', points: 10, createdAt: daysAgo(100) });

    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result).toHaveLength(10);
    expect(result.every(t => t.type === 'roulette')).toBe(true);
  });

  it('never mixes another user\'s transactions in', async () => {
    ledgerStore.push({ username: 'bob', actionType: 'blog', points: 10, createdAt: daysAgo(1) });
    const { getRecentTransactions } = await import('./transactionHistory');
    const result = await getRecentTransactions('alice', 10);
    expect(result).toHaveLength(0);
  });
});
