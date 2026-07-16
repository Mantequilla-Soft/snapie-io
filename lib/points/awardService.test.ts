import { describe, it, expect, vi, beforeEach } from 'vitest';

// awardService is pure orchestration over three things: connectDB, the two
// Mongoose models, and verifyAction. All three are mocked so these tests
// exercise ONLY awardService's own logic (idempotency, daily caps,
// self/unverified handling, balance bookkeeping) — not real Mongo or Hive.
//
// The ledger fake enforces the same uniqueness contract as the real schema's
// compound unique index (username, actionType, refKey): a second create()
// with the same three fields rejects with a Mongo-shaped {code: 11000} error,
// exactly like a real duplicate-key error would. That's the behavior
// awardService's catch block depends on, so the fake has to honor it for the
// idempotency tests to mean anything.

interface FakeLedgerDoc {
    username: string;
    actionType: string;
    points: number;
    refKey: string;
    createdAt: Date;
}

let ledgerStore: FakeLedgerDoc[] = [];
let accountStore: Map<string, { balance: number; lifetimeEarned: number }> = new Map();

vi.mock('@/lib/db/mongodb', () => ({
    connectDB: vi.fn(async () => {}),
}));

vi.mock('@/lib/db/models/PointsLedger', () => ({
    PointsLedger: {
        findOne: (filter: { username: string; actionType: string; refKey: string }) => ({
            lean: async () =>
                ledgerStore.find(
                    d => d.username === filter.username && d.actionType === filter.actionType && d.refKey === filter.refKey,
                ) ?? null,
        }),
        countDocuments: async (filter: { username: string; actionType: string; createdAt: { $gte: Date } }) =>
            ledgerStore.filter(
                d =>
                    d.username === filter.username &&
                    d.actionType === filter.actionType &&
                    d.createdAt >= filter.createdAt.$gte,
            ).length,
        create: async (doc: Omit<FakeLedgerDoc, 'createdAt'>) => {
            const dup = ledgerStore.find(
                d => d.username === doc.username && d.actionType === doc.actionType && d.refKey === doc.refKey,
            );
            if (dup) {
                const err = Object.assign(new Error('duplicate key'), { code: 11000 });
                throw err;
            }
            const full: FakeLedgerDoc = { ...doc, createdAt: new Date() };
            ledgerStore.push(full);
            return full;
        },
    },
}));

vi.mock('@/lib/db/models/PointsAccount', () => ({
    PointsAccount: {
        findById: (username: string) => ({
            lean: async () => {
                const acct = accountStore.get(username);
                return acct ? { _id: username, ...acct } : null;
            },
        }),
        findByIdAndUpdate: (
            username: string,
            update: { $inc: { balance: number; lifetimeEarned: number } },
        ) => ({
            lean: async () => {
                const prev = accountStore.get(username) ?? { balance: 0, lifetimeEarned: 0 };
                const next = {
                    balance: prev.balance + update.$inc.balance,
                    lifetimeEarned: prev.lifetimeEarned + update.$inc.lifetimeEarned,
                };
                accountStore.set(username, next);
                return { _id: username, ...next };
            },
        }),
        countDocuments: async (filter: { lifetimeEarned: { $gt: number } }) =>
            [...accountStore.values()].filter(v => v.lifetimeEarned > filter.lifetimeEarned.$gt).length,
        find: (filter: { lifetimeEarned: { $gt: number } }) => {
            let rows = [...accountStore.entries()]
                .map(([_id, v]) => ({ _id, ...v }))
                .filter(r => r.lifetimeEarned > filter.lifetimeEarned.$gt);
            const chain = {
                sort(spec: { lifetimeEarned: -1 | 1 }) {
                    rows = rows.sort((a, b) => (spec.lifetimeEarned === -1 ? b.lifetimeEarned - a.lifetimeEarned : a.lifetimeEarned - b.lifetimeEarned));
                    return chain;
                },
                limit(n: number) {
                    rows = rows.slice(0, n);
                    return chain;
                },
                lean: async () => rows,
            };
            return chain;
        },
    },
}));

const verifyActionMock = vi.fn();
vi.mock('@/lib/points/hiveVerify', () => ({
    verifyAction: (...args: unknown[]) => verifyActionMock(...args),
}));

beforeEach(() => {
    ledgerStore = [];
    accountStore = new Map();
    verifyActionMock.mockReset();
    verifyActionMock.mockResolvedValue('ok');
});

describe('awardForAction', () => {
    it('awards points and updates both balance and lifetimeEarned on a fresh action', async () => {
        const { awardForAction } = await import('./awardService');
        const result = await awardForAction('alice', 'blog', 'alice', 'my-post');
        expect(result).toEqual({ status: 'awarded', awarded: 10, balance: 10 });

        const { getPointsSummary } = await import('./awardService');
        expect(await getPointsSummary('alice')).toEqual({ username: 'alice', balance: 10, lifetimeEarned: 10, rank: 1 });
    });

    it('is idempotent: the same action on the same target only ever pays once', async () => {
        const { awardForAction } = await import('./awardService');
        const first = await awardForAction('alice', 'snap', 'alice', 'snap-1');
        const second = await awardForAction('alice', 'snap', 'alice', 'snap-1');

        expect(first.status).toBe('awarded');
        expect(second).toEqual({ status: 'duplicate', awarded: 0, balance: first.balance });
        expect(verifyActionMock).toHaveBeenCalledTimes(1); // no re-verification for a known duplicate
    });

    it('treats a different target (different refKey) as a separate, payable action', async () => {
        const { awardForAction } = await import('./awardService');
        await awardForAction('alice', 'vote', 'bob', 'post-1');
        const second = await awardForAction('alice', 'vote', 'bob', 'post-2');
        expect(second.status).toBe('awarded');
        expect(second.balance).toBe(2); // 1 + 1
    });

    it('does not award when verifyAction reports self-dealing', async () => {
        verifyActionMock.mockResolvedValue('self');
        const { awardForAction } = await import('./awardService');
        const result = await awardForAction('alice', 'vote', 'alice', 'own-post');
        expect(result).toEqual({ status: 'self', awarded: 0, balance: 0 });
    });

    it('does not award when verifyAction cannot confirm the action', async () => {
        verifyActionMock.mockResolvedValue('unverified');
        const { awardForAction } = await import('./awardService');
        const result = await awardForAction('alice', 'blog', 'alice', 'fake-post');
        expect(result).toEqual({ status: 'unverified', awarded: 0, balance: 0 });
    });

    it('enforces the daily cap on a capped action type (vote, cap 20)', async () => {
        const { awardForAction } = await import('./awardService');
        for (let i = 0; i < 20; i++) {
            const r = await awardForAction('alice', 'vote', 'bob', `post-${i}`);
            expect(r.status).toBe('awarded');
        }
        const capped = await awardForAction('alice', 'vote', 'bob', 'post-20');
        expect(capped).toEqual({ status: 'capped', awarded: 0, balance: 20 });
        // Verification should never even run once the cap is already hit.
        expect(verifyActionMock).toHaveBeenCalledTimes(20);
    });

    it('never caps an uncapped action type (blog) no matter the volume', async () => {
        const { awardForAction } = await import('./awardService');
        for (let i = 0; i < 25; i++) {
            const r = await awardForAction('alice', 'blog', 'alice', `post-${i}`);
            expect(r.status).toBe('awarded');
        }
    });

    it('only counts today’s actions toward the cap, not older ones', async () => {
        const { awardForAction } = await import('./awardService');
        // Backdate 20 existing reblog entries to yesterday, directly in the store.
        const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
        for (let i = 0; i < 20; i++) {
            ledgerStore.push({ username: 'alice', actionType: 'reblog', points: 2, refKey: `old-${i}`, createdAt: yesterday });
        }
        const result = await awardForAction('alice', 'reblog', 'bob', 'today-post');
        expect(result.status).toBe('awarded'); // today's count is 0, cap not hit
    });

    it('keeps per-user caps independent — one user hitting the cap does not affect another', async () => {
        const { awardForAction } = await import('./awardService');
        for (let i = 0; i < 5; i++) {
            await awardForAction('alice', 'reblog', 'bob', `post-${i}`); // cap is 5
        }
        expect((await awardForAction('alice', 'reblog', 'bob', 'post-5')).status).toBe('capped');
        expect((await awardForAction('carol', 'reblog', 'bob', 'post-0')).status).toBe('awarded');
    });
});

describe('getPointsSummary', () => {
    it('returns zeros and a null rank for a user who has never earned anything', async () => {
        const { getPointsSummary } = await import('./awardService');
        expect(await getPointsSummary('nobody')).toEqual({ username: 'nobody', balance: 0, lifetimeEarned: 0, rank: null });
    });

    it('computes rank as 1 more than the number of accounts strictly ahead', async () => {
        accountStore.set('gold', { balance: 100, lifetimeEarned: 100 });
        accountStore.set('silver', { balance: 50, lifetimeEarned: 50 });
        accountStore.set('bronze', { balance: 10, lifetimeEarned: 10 });
        const { getPointsSummary } = await import('./awardService');
        expect((await getPointsSummary('gold')).rank).toBe(1);
        expect((await getPointsSummary('silver')).rank).toBe(2);
        expect((await getPointsSummary('bronze')).rank).toBe(3);
    });

    it('gives tied accounts the same rank', async () => {
        accountStore.set('alice', { balance: 50, lifetimeEarned: 50 });
        accountStore.set('bob', { balance: 50, lifetimeEarned: 50 });
        accountStore.set('carol', { balance: 10, lifetimeEarned: 10 });
        const { getPointsSummary } = await import('./awardService');
        expect((await getPointsSummary('alice')).rank).toBe(1);
        expect((await getPointsSummary('bob')).rank).toBe(1);
        expect((await getPointsSummary('carol')).rank).toBe(3); // 2 accounts rank strictly above
    });

    it('ranks by lifetimeEarned even when balance says otherwise (spending never demotes you)', async () => {
        accountStore.set('bigspender', { balance: 1, lifetimeEarned: 200 });
        accountStore.set('hoarder', { balance: 150, lifetimeEarned: 150 });
        const { getPointsSummary } = await import('./awardService');
        expect((await getPointsSummary('bigspender')).rank).toBe(1);
        expect((await getPointsSummary('hoarder')).rank).toBe(2);
    });
});

describe('getLeaderboard', () => {
    it('ranks by lifetimeEarned, not balance — spending never demotes you', async () => {
        // Simulates a future Stage-3 spend: alice has earned more lifetime but
        // has a lower current balance than bob. The leaderboard must still rank
        // alice above bob (see PointsAccount schema comment on lifetimeEarned).
        accountStore.set('alice', { balance: 5, lifetimeEarned: 100 });
        accountStore.set('bob', { balance: 50, lifetimeEarned: 50 });
        const { getLeaderboard } = await import('./awardService');
        const board = await getLeaderboard(10);
        expect(board.map(e => e.username)).toEqual(['alice', 'bob']);
        expect(board[0].rank).toBe(1);
        expect(board[1].rank).toBe(2);
    });

    it('excludes accounts that have never earned anything', async () => {
        accountStore.set('alice', { balance: 0, lifetimeEarned: 0 });
        accountStore.set('bob', { balance: 10, lifetimeEarned: 10 });
        const { getLeaderboard } = await import('./awardService');
        const board = await getLeaderboard(10);
        expect(board.map(e => e.username)).toEqual(['bob']);
    });

    it('respects the limit', async () => {
        for (let i = 0; i < 10; i++) accountStore.set(`user${i}`, { balance: i + 1, lifetimeEarned: i + 1 });
        const { getLeaderboard } = await import('./awardService');
        const board = await getLeaderboard(3);
        expect(board).toHaveLength(3);
        expect(board.map(e => e.lifetimeEarned)).toEqual([10, 9, 8]);
    });
});
