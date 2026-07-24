import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same shape as awardService.test.ts: purchaseService is pure orchestration
// over connectDB, three Mongoose models, and verifyTransfer, all mocked so
// these tests exercise ONLY purchaseService's own logic — not real Mongo or
// Hive. The ledger/purchase fakes enforce the same uniqueness contracts as
// the real schemas' unique indexes.

interface FakeLedgerDoc {
    username: string;
    actionType: string;
    points: number;
    refKey: string;
    createdAt: Date;
}
interface FakePurchaseDoc {
    username: string;
    txid: string;
    hbdAmount: number;
    pointsCredited: number;
    createdAt: Date;
}

let ledgerStore: FakeLedgerDoc[] = [];
let purchaseStore: FakePurchaseDoc[] = [];
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
        create: async (doc: Omit<FakeLedgerDoc, 'createdAt'>) => {
            const dup = ledgerStore.find(
                d => d.username === doc.username && d.actionType === doc.actionType && d.refKey === doc.refKey,
            );
            if (dup) throw Object.assign(new Error('duplicate key'), { code: 11000 });
            const full: FakeLedgerDoc = { ...doc, createdAt: new Date() };
            ledgerStore.push(full);
            return full;
        },
    },
}));

vi.mock('@/lib/db/models/PointsPurchase', () => ({
    PointsPurchase: {
        findOne: (filter: { txid: string }) => ({
            lean: async () => purchaseStore.find(d => d.txid === filter.txid) ?? null,
        }),
        create: async (doc: Omit<FakePurchaseDoc, 'createdAt'>) => {
            const dup = purchaseStore.find(d => d.txid === doc.txid);
            if (dup) throw Object.assign(new Error('duplicate key'), { code: 11000 });
            const full: FakePurchaseDoc = { ...doc, createdAt: new Date() };
            purchaseStore.push(full);
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
        findByIdAndUpdate: (username: string, update: { $inc: { balance: number } }) => ({
            lean: async () => {
                const prev = accountStore.get(username) ?? { balance: 0, lifetimeEarned: 0 };
                const next = { balance: prev.balance + update.$inc.balance, lifetimeEarned: prev.lifetimeEarned };
                accountStore.set(username, next);
                return { _id: username, ...next };
            },
        }),
    },
}));

const verifyTransferMock = vi.fn();
vi.mock('@/lib/points/purchaseVerify', () => ({
    verifyTransfer: (...args: unknown[]) => verifyTransferMock(...args),
}));

beforeEach(() => {
    ledgerStore = [];
    purchaseStore = [];
    accountStore = new Map();
    verifyTransferMock.mockReset();
    verifyTransferMock.mockResolvedValue({ hbdAmount: 5 });
});

describe('creditPurchase', () => {
    it('credits balance only — lifetimeEarned is never touched by a purchase', async () => {
        const { creditPurchase } = await import('./purchaseService');
        accountStore.set('alice', { balance: 10, lifetimeEarned: 200 }); // pre-existing earned points
        const result = await creditPurchase('alice', 'tx1');
        expect(result).toEqual({ status: 'credited', pointsCredited: 500, balance: 510 }); // 5 HBD * 100 pts/HBD
        expect(accountStore.get('alice')).toEqual({ balance: 510, lifetimeEarned: 200 }); // unchanged
    });

    it('computes points from the on-chain-verified amount, at 100 points per HBD', async () => {
        verifyTransferMock.mockResolvedValue({ hbdAmount: 2.5 });
        const { creditPurchase } = await import('./purchaseService');
        const result = await creditPurchase('alice', 'tx1');
        expect(result).toEqual({ status: 'credited', pointsCredited: 250, balance: 250 });
    });

    it('is idempotent: resubmitting the same txid does not double-credit', async () => {
        const { creditPurchase } = await import('./purchaseService');
        const first = await creditPurchase('alice', 'tx1');
        const second = await creditPurchase('alice', 'tx1');
        expect(first.status).toBe('credited');
        expect(second).toEqual({ status: 'duplicate', pointsCredited: 0, balance: first.balance });
        expect(verifyTransferMock).toHaveBeenCalledTimes(1); // no re-verification for a known duplicate
    });

    it('does not credit when the transfer cannot be verified on-chain', async () => {
        verifyTransferMock.mockResolvedValue(null);
        const { creditPurchase } = await import('./purchaseService');
        const result = await creditPurchase('alice', 'tx-fake');
        expect(result).toEqual({ status: 'unverified', pointsCredited: 0, balance: 0 });
        expect(ledgerStore).toHaveLength(0);
        expect(purchaseStore).toHaveLength(0);
    });

    it('rejects an amount below the minimum without crediting anything', async () => {
        verifyTransferMock.mockResolvedValue({ hbdAmount: 0.5 }); // MIN_PURCHASE_HBD is 1
        const { creditPurchase } = await import('./purchaseService');
        const result = await creditPurchase('alice', 'tx1');
        expect(result.status).toBe('out_of_range');
        expect(result.pointsCredited).toBe(0);
        expect(purchaseStore).toHaveLength(0);
    });

    it('rejects an amount above the maximum without crediting anything', async () => {
        verifyTransferMock.mockResolvedValue({ hbdAmount: 5000 }); // MAX_PURCHASE_HBD is 1000
        const { creditPurchase } = await import('./purchaseService');
        const result = await creditPurchase('alice', 'tx1');
        expect(result.status).toBe('out_of_range');
        expect(purchaseStore).toHaveLength(0);
    });

    it('writes one PointsPurchase audit row per credited purchase, matching the ledger entry', async () => {
        const { creditPurchase } = await import('./purchaseService');
        await creditPurchase('alice', 'tx1');
        expect(purchaseStore).toEqual([
            expect.objectContaining({ username: 'alice', txid: 'tx1', hbdAmount: 5, pointsCredited: 500 }),
        ]);
        expect(ledgerStore).toEqual([
            expect.objectContaining({ username: 'alice', actionType: 'purchase', points: 500, refKey: 'tx1' }),
        ]);
    });

    it('keeps different users crediting independently for the same-shaped transfer', async () => {
        const { creditPurchase } = await import('./purchaseService');
        await creditPurchase('alice', 'tx1');
        const bob = await creditPurchase('bob', 'tx2');
        expect(bob.status).toBe('credited');
        expect(bob.balance).toBe(500);
    });

    it('still credits the balance even if the audit (PointsPurchase) write fails after the ledger write succeeds', async () => {
        // Regression test for the original bug: PointsPurchase used to be
        // written FIRST and act as the idempotency gate, so if a later write
        // failed, the purchase was stuck forever — a retry would see the
        // audit row, report 'duplicate', and never credit anything. The fix
        // makes PointsLedger the sole gate and PointsPurchase best-effort and
        // last, so a failure here must not affect the credit that already
        // landed, and must not block a legitimate future retry either.
        const { PointsPurchase } = await import('@/lib/db/models/PointsPurchase');
        vi.spyOn(PointsPurchase, 'create').mockRejectedValueOnce(new Error('transient mongo error'));
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { creditPurchase } = await import('./purchaseService');
        const result = await creditPurchase('alice', 'tx1');

        expect(result).toEqual({ status: 'credited', pointsCredited: 500, balance: 500 });
        expect(accountStore.get('alice')).toEqual({ balance: 500, lifetimeEarned: 0 });
        expect(consoleErrorSpy).toHaveBeenCalled();

        // A resubmission of the same txid must still correctly report it as
        // already handled — not silently re-credit, and not error out.
        const retry = await creditPurchase('alice', 'tx1');
        expect(retry).toEqual({ status: 'duplicate', pointsCredited: 0, balance: 500 });

        consoleErrorSpy.mockRestore();
    });
});
