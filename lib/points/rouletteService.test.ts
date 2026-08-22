import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fakes below reproduce the two real MongoDB semantics this service leans
// on: (1) inserting a doc that collides on a unique index throws a real
// duplicate-key error (code 11000) rather than silently succeeding — this is
// what makes claiming a spinId in spinRoulette() an atomic idempotency gate;
// (2) a guarded $inc (balance: {$gte: stake}) returns null instead of
// applying the update when the condition fails, rather than throwing.

interface FakeSpinDoc {
  username: string;
  spinId: string;
  stake: number;
  multiplier: number;
  payout: number;
  serverRoll: number;
  createdAt: Date;
}
interface FakeAccountDoc {
  _id: string;
  balance: number;
  lifetimeEarned: number;
}

let spinStore: Map<string, FakeSpinDoc> = new Map();
let accountStore: Map<string, FakeAccountDoc> = new Map();

function spinKey(username: string, spinId: string): string {
  return `${username}:${spinId}`;
}

vi.mock('@/lib/db/mongodb', () => ({
  connectDB: vi.fn(async () => {}),
}));

vi.mock('crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, randomInt: vi.fn() };
});

vi.mock('@/lib/db/models/RouletteSpin', () => ({
  RouletteSpin: {
    findOne: (filter: { username: string; spinId?: string }) => {
      const chain = {
        sort: () => chain,
        lean: async () => {
          if (filter.spinId !== undefined) {
            return spinStore.get(spinKey(filter.username, filter.spinId)) ?? null;
          }
          const rows = Array.from(spinStore.values()).filter(r => r.username === filter.username);
          if (rows.length === 0) return null;
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return rows[0];
        },
      };
      return chain;
    },
    create: async (doc: {
      username: string;
      spinId: string;
      stake: number;
      multiplier: number;
      payout: number;
      serverRoll: number;
    }) => {
      const key = spinKey(doc.username, doc.spinId);
      if (spinStore.has(key)) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      const full: FakeSpinDoc = { ...doc, createdAt: new Date() };
      spinStore.set(key, full);
      return full;
    },
    deleteOne: async (filter: { username: string; spinId: string }) => {
      spinStore.delete(spinKey(filter.username, filter.spinId));
    },
  },
}));

vi.mock('@/lib/db/models/PointsAccount', () => ({
  PointsAccount: {
    findById: (id: string) => ({
      lean: async () => accountStore.get(id) ?? null,
    }),
    findOneAndUpdate: (filter: { _id: string; balance: { $gte: number } }, update: { $inc: { balance: number } }) => ({
      lean: async () => {
        const existing = accountStore.get(filter._id);
        if (!existing || existing.balance < filter.balance.$gte) return null; // guard failed
        const next = { ...existing, balance: existing.balance + update.$inc.balance };
        accountStore.set(filter._id, next);
        return next;
      },
    }),
  },
}));

beforeEach(() => {
  spinStore = new Map();
  accountStore = new Map();
  vi.clearAllMocks();
});

async function mockRoll(value: number) {
  const { randomInt } = await import('crypto');
  (randomInt as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value);
}

describe('spinRoulette', () => {
  it('rejects a stake below MIN_STAKE without touching balance or storage', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
    const { spinRoulette } = await import('./rouletteService');
    const result = await spinRoulette('alice', 'spin-1', 1);
    expect(result.status).toBe('invalid_stake');
    expect(accountStore.get('alice')?.balance).toBe(1000);
    expect(spinStore.size).toBe(0);
  });

  it('rejects a stake above MAX_STAKE', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 100000, lifetimeEarned: 100000 });
    const { spinRoulette } = await import('./rouletteService');
    const result = await spinRoulette('alice', 'spin-1', 5000);
    expect(result.status).toBe('invalid_stake');
  });

  it('burns the stake outright on a losing roll', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
    await mockRoll(0); // 0 < 7725 threshold => 0x
    const { spinRoulette } = await import('./rouletteService');
    const result = await spinRoulette('alice', 'spin-1', 100);
    expect(result.status).toBe('spun');
    expect(result.multiplier).toBe(0);
    expect(result.payout).toBe(0);
    expect(result.netDelta).toBe(-100);
    expect(result.balance).toBe(900);
    expect(accountStore.get('alice')?.lifetimeEarned).toBe(1000); // never touched by a spin
  });

  it('pays out a jackpot (5x) and credits the net gain in one update', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
    await mockRoll(9999); // >= 9950 threshold => 5x
    const { spinRoulette } = await import('./rouletteService');
    const result = await spinRoulette('alice', 'spin-1', 100);
    expect(result.status).toBe('spun');
    expect(result.multiplier).toBe(5);
    expect(result.payout).toBe(500);
    expect(result.netDelta).toBe(400);
    expect(result.balance).toBe(1400); // 1000 - 100 + 500
    expect(accountStore.get('alice')?.lifetimeEarned).toBe(1000); // a jackpot doesn't touch the leaderboard
  });

  it('rejects a spin with insufficient balance and leaves the claim rolled back', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 50, lifetimeEarned: 50 });
    await mockRoll(0);
    const { spinRoulette } = await import('./rouletteService');
    const result = await spinRoulette('alice', 'spin-1', 100);
    expect(result.status).toBe('insufficient_balance');
    expect(accountStore.get('alice')?.balance).toBe(50); // untouched
    expect(spinStore.size).toBe(0); // claim rolled back, spinId is free again
  });

  it('allows retrying the same spinId after the balance is topped up', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 50, lifetimeEarned: 50 });
    await mockRoll(0);
    const { spinRoulette } = await import('./rouletteService');
    const first = await spinRoulette('alice', 'spin-1', 100);
    expect(first.status).toBe('insufficient_balance');

    accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
    const retry = await spinRoulette('alice', 'spin-1', 100);
    expect(retry.status).toBe('spun');
  });

  it('is idempotent — resubmitting the same spinId returns the original result without charging twice', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
    await mockRoll(9999); // 5x on the only real roll
    const { spinRoulette } = await import('./rouletteService');
    const first = await spinRoulette('alice', 'spin-1', 100);
    const second = await spinRoulette('alice', 'spin-1', 100);
    expect(first.status).toBe('spun');
    expect(second.status).toBe('duplicate');
    expect(second.multiplier).toBe(5);
    expect(second.payout).toBe(500);
    expect(accountStore.get('alice')?.balance).toBe(1400); // charged exactly once
  });

  it('rejects a second spin inside the cooldown window', async () => {
    accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
    await mockRoll(0);
    const { spinRoulette } = await import('./rouletteService');
    const first = await spinRoulette('alice', 'spin-1', 100);
    const second = await spinRoulette('alice', 'spin-2', 100);
    expect(first.status).toBe('spun');
    expect(second.status).toBe('cooldown');
    expect(accountStore.get('alice')?.balance).toBe(900); // only the first spin charged
  });
});
