import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same shape as purchaseService.test.ts: adminGrantService is pure
// orchestration over connectDB and three Mongoose models, all mocked so
// these tests exercise ONLY adminGrantService's own logic — not real Mongo.
// The ledger/grant fakes enforce the same uniqueness contracts as the real
// schemas' unique indexes.

interface FakeLedgerDoc {
    username: string;
    actionType: string;
    points: number;
    refKey: string;
    createdAt: Date;
}
interface FakeGrantDoc {
    username: string;
    grantedBy: string;
    points: number;
    reason?: string;
    refKey: string;
    createdAt: Date;
}

let ledgerStore: FakeLedgerDoc[] = [];
let grantStore: FakeGrantDoc[] = [];
let accountStore: Map<string, { balance: number; lifetimeEarned: number }> = new Map();

vi.mock('@/lib/db/mongodb', () => ({
    connectDB: vi.fn(async () => {}),
}));

vi.mock('@/lib/db/models/PointsLedger', () => ({
    PointsLedger: {
        create: async (doc: Omit<FakeLedgerDoc, 'createdAt'>) => {
            const dup = ledgerStore.find(d => d.refKey === doc.refKey);
            if (dup) throw Object.assign(new Error('duplicate key'), { code: 11000 });
            const full: FakeLedgerDoc = { ...doc, createdAt: new Date() };
            ledgerStore.push(full);
            return full;
        },
    },
}));

vi.mock('@/lib/db/models/PointsGrant', () => ({
    PointsGrant: {
        create: async (doc: Omit<FakeGrantDoc, 'createdAt'>) => {
            const dup = grantStore.find(d => d.refKey === doc.refKey);
            if (dup) throw Object.assign(new Error('duplicate key'), { code: 11000 });
            const full: FakeGrantDoc = { ...doc, createdAt: new Date() };
            grantStore.push(full);
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

beforeEach(() => {
    ledgerStore = [];
    grantStore = [];
    accountStore = new Map();
});

describe('grantPoints', () => {
    it('credits balance only — lifetimeEarned is never touched by an admin grant', async () => {
        const { grantPoints } = await import('./adminGrantService');
        accountStore.set('alice', { balance: 10, lifetimeEarned: 200 });
        const result = await grantPoints('admin', 'alice', 100, 'apology', 'key1');
        expect(result).toEqual({ status: 'granted', pointsGranted: 100, balance: 110 });
        expect(accountStore.get('alice')).toEqual({ balance: 110, lifetimeEarned: 200 });
    });

    it('is idempotent: resubmitting the same idempotency key does not double-grant', async () => {
        const { grantPoints } = await import('./adminGrantService');
        const first = await grantPoints('admin', 'alice', 100, undefined, 'key1');
        const second = await grantPoints('admin', 'alice', 100, undefined, 'key1');
        expect(first.status).toBe('granted');
        expect(second).toEqual({ status: 'duplicate', pointsGranted: 0, balance: first.balance });
    });

    it('allows two separate grants to the same user with different keys', async () => {
        const { grantPoints } = await import('./adminGrantService');
        await grantPoints('admin', 'alice', 100, undefined, 'key1');
        const second = await grantPoints('admin', 'alice', 50, undefined, 'key2');
        expect(second).toEqual({ status: 'granted', pointsGranted: 50, balance: 150 });
    });

    it('rejects a non-positive amount without crediting anything', async () => {
        const { grantPoints } = await import('./adminGrantService');
        const result = await grantPoints('admin', 'alice', 0, undefined, 'key1');
        expect(result).toEqual({ status: 'invalid_amount', pointsGranted: 0, balance: 0 });
        expect(ledgerStore).toHaveLength(0);
    });

    it('rejects a non-integer amount without crediting anything', async () => {
        const { grantPoints } = await import('./adminGrantService');
        const result = await grantPoints('admin', 'alice', 12.5, undefined, 'key1');
        expect(result.status).toBe('invalid_amount');
        expect(ledgerStore).toHaveLength(0);
    });

    it('rejects an amount above the per-grant cap without crediting anything', async () => {
        const { MAX_ADMIN_GRANT_POINTS } = await import('./constants');
        const { grantPoints } = await import('./adminGrantService');
        const result = await grantPoints('admin', 'alice', MAX_ADMIN_GRANT_POINTS + 1, undefined, 'key1');
        expect(result.status).toBe('invalid_amount');
        expect(ledgerStore).toHaveLength(0);
    });

    it('writes one PointsGrant audit row per granted credit, recording who granted it and why', async () => {
        const { grantPoints } = await import('./adminGrantService');
        await grantPoints('admin', 'alice', 100, 'apology for the badge bug', 'key1');
        expect(grantStore).toEqual([
            expect.objectContaining({ username: 'alice', grantedBy: 'admin', points: 100, reason: 'apology for the badge bug', refKey: 'key1' }),
        ]);
        expect(ledgerStore).toEqual([
            expect.objectContaining({ username: 'alice', actionType: 'admin_grant', points: 100, refKey: 'key1' }),
        ]);
    });

    it('still credits the balance even if the audit (PointsGrant) write fails after the ledger write succeeds', async () => {
        const { PointsGrant } = await import('@/lib/db/models/PointsGrant');
        vi.spyOn(PointsGrant, 'create').mockRejectedValueOnce(new Error('transient mongo error'));
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { grantPoints } = await import('./adminGrantService');
        const result = await grantPoints('admin', 'alice', 100, undefined, 'key1');

        expect(result).toEqual({ status: 'granted', pointsGranted: 100, balance: 100 });
        expect(accountStore.get('alice')).toEqual({ balance: 100, lifetimeEarned: 0 });
        expect(consoleErrorSpy).toHaveBeenCalled();

        const retry = await grantPoints('admin', 'alice', 100, undefined, 'key1');
        expect(retry).toEqual({ status: 'duplicate', pointsGranted: 0, balance: 100 });

        consoleErrorSpy.mockRestore();
    });

    it('keeps different users granting independently for the same-shaped request', async () => {
        const { grantPoints } = await import('./adminGrantService');
        await grantPoints('admin', 'alice', 100, undefined, 'key1');
        const bob = await grantPoints('admin', 'bob', 100, undefined, 'key2');
        expect(bob.status).toBe('granted');
        expect(bob.balance).toBe(100);
    });
});
