import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fakes below faithfully reproduce the two real MongoDB semantics this
// service leans on: (1) findOneAndUpdate with upsert:true, when the filter
// doesn't match an existing doc with the same _id, attempts an insert that
// throws a real duplicate-key error (code 11000) rather than silently
// creating a second doc — this is what makes the "claim the sku" step in
// buyBadge() an atomic idempotency gate; (2) a guarded $inc (balance:
// {$gte: price}) returns null instead of applying the update when the
// condition fails, rather than throwing.

interface FakeBadgesDoc { _id: string; owned: string[]; equipped: string | null; }
interface FakeAccountDoc { _id: string; balance: number; lifetimeEarned: number; }
interface FakePurchaseRow { username: string; sku: string; price: number; }

let badgesStore: Map<string, FakeBadgesDoc> = new Map();
let accountStore: Map<string, FakeAccountDoc> = new Map();
let purchaseStore: FakePurchaseRow[] = [];

vi.mock('@/lib/db/mongodb', () => ({
    connectDB: vi.fn(async () => {}),
}));

vi.mock('@/lib/db/models/MoodBadges', () => ({
    MoodBadges: {
        findById: (id: string) => ({
            lean: async () => badgesStore.get(id) ?? null,
        }),
        findOneAndUpdate: async (
            filter: { _id: string; owned?: { $ne: string }; equipped?: null },
            update: { $addToSet?: { owned: string }; $set?: { equipped: string | null } },
            opts?: { upsert?: boolean },
        ) => {
            const existing = badgesStore.get(filter._id);

            if (filter.owned?.$ne !== undefined) {
                const alreadyOwns = existing?.owned.includes(filter.owned.$ne);
                if (existing && alreadyOwns) {
                    if (opts?.upsert) {
                        // Same _id exists but doesn't match the filter — Mongo
                        // attempts an insert, collides on the unique _id index.
                        throw Object.assign(new Error('duplicate key'), { code: 11000 });
                    }
                    return null;
                }
                const doc: FakeBadgesDoc = existing
                    ? { ...existing, owned: [...existing.owned, filter.owned.$ne] }
                    : { _id: filter._id, owned: [filter.owned.$ne], equipped: null };
                badgesStore.set(filter._id, doc);
                return doc;
            }

            if (filter.equipped === null) {
                if (existing && existing.equipped !== null) return null; // guard failed, no-op
                const doc: FakeBadgesDoc = existing
                    ? { ...existing, equipped: update.$set!.equipped! }
                    : { _id: filter._id, owned: [], equipped: update.$set!.equipped! };
                badgesStore.set(filter._id, doc);
                return doc;
            }

            throw new Error('unhandled fake findOneAndUpdate filter shape');
        },
        findByIdAndUpdate: async (
            id: string,
            update: { $pull?: { owned: string }; $set?: { equipped: string | null } },
            opts?: { upsert?: boolean },
        ) => {
            const existing = badgesStore.get(id);
            if (!existing && !opts?.upsert) return null;
            const doc: FakeBadgesDoc = existing ?? { _id: id, owned: [], equipped: null };
            if (update.$pull) doc.owned = doc.owned.filter(s => s !== update.$pull!.owned);
            if (update.$set) doc.equipped = update.$set.equipped;
            badgesStore.set(id, doc);
            return doc;
        },
        find: (filter: { equipped: { $ne: null } }) => ({
            lean: async () => Array.from(badgesStore.values()).filter(d => d.equipped !== null),
        }),
    },
}));

vi.mock('@/lib/db/models/PointsAccount', () => ({
    PointsAccount: {
        findById: (id: string) => ({
            lean: async () => accountStore.get(id) ?? null,
        }),
        findOneAndUpdate: (filter: { _id: string; balance: { $gte: number } }, update: { $inc: { balance: number } }) => ({
            lean: async () => {
                const existing = accountStore.get(filter._id) ?? { _id: filter._id, balance: 0, lifetimeEarned: 0 };
                if (existing.balance < filter.balance.$gte) return null; // guard failed
                const next = { ...existing, balance: existing.balance + update.$inc.balance };
                accountStore.set(filter._id, next);
                return next;
            },
        }),
    },
}));

vi.mock('@/lib/db/models/MoodBadgePurchase', () => ({
    MoodBadgePurchase: {
        create: async (doc: FakePurchaseRow) => {
            purchaseStore.push(doc);
            return doc;
        },
    },
}));

beforeEach(() => {
    badgesStore = new Map();
    accountStore = new Map();
    purchaseStore = [];
});

describe('buyBadge', () => {
    it('purchases successfully, decrements balance, and auto-equips the first badge', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        const { buyBadge } = await import('./service');
        const result = await buyBadge('alice', 'bull');
        expect(result.status).toBe('purchased');
        expect(result.owned).toEqual(['bull']);
        expect(result.equipped).toBe('bull');
        expect(result.balance).toBe(500); // 1000 - 500
        expect(accountStore.get('alice')?.lifetimeEarned).toBe(1000); // never touched by a spend
        expect(purchaseStore).toEqual([{ username: 'alice', sku: 'bull', price: 500 }]);
    });

    it('does not auto-equip a second purchase when something is already equipped', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 2000, lifetimeEarned: 2000 });
        const { buyBadge } = await import('./service');
        await buyBadge('alice', 'bull');
        const second = await buyBadge('alice', 'bear');
        expect(second.status).toBe('purchased');
        expect(second.owned.sort()).toEqual(['bear', 'bull']);
        expect(second.equipped).toBe('bull'); // unchanged — switching is a separate explicit action
    });

    it('rejects a purchase with insufficient balance and does not grant ownership', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 100, lifetimeEarned: 100 });
        const { buyBadge } = await import('./service');
        const result = await buyBadge('alice', 'bull');
        expect(result.status).toBe('insufficient_balance');
        expect(result.owned).toEqual([]);
        expect(result.equipped).toBeNull();
        expect(accountStore.get('alice')?.balance).toBe(100); // untouched
        expect(purchaseStore).toEqual([]); // no charge happened, no audit row either
    });

    it('rolls back the ownership claim so a later purchase can succeed after earning more points', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 100, lifetimeEarned: 100 });
        const { buyBadge } = await import('./service');
        await buyBadge('alice', 'bull'); // fails, insufficient balance
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        const retry = await buyBadge('alice', 'bull');
        expect(retry.status).toBe('purchased');
        expect(retry.owned).toEqual(['bull']);
    });

    it('is idempotent — buying an already-owned badge again does not charge twice', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        const { buyBadge } = await import('./service');
        const first = await buyBadge('alice', 'bull');
        const second = await buyBadge('alice', 'bull');
        expect(first.status).toBe('purchased');
        expect(second.status).toBe('already_owned');
        expect(accountStore.get('alice')?.balance).toBe(500); // charged exactly once
        expect(purchaseStore).toHaveLength(1); // audit row written once, not on the already_owned replay
    });

    it('handles a concurrent double-buy race without double-charging (the claim step is the atomic gate)', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        const { buyBadge } = await import('./service');
        const [a, b] = await Promise.all([buyBadge('alice', 'bull'), buyBadge('alice', 'bull')]);
        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual(['already_owned', 'purchased']);
        expect(accountStore.get('alice')?.balance).toBe(500); // charged exactly once, not twice
    });
});

describe('equipBadge', () => {
    it('equips an owned badge', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        const { buyBadge, equipBadge } = await import('./service');
        await buyBadge('alice', 'bull');
        await buyBadge('alice', 'bear');
        const result = await equipBadge('alice', 'bear');
        expect(result.status).toBe('equipped');
        expect(result.equipped).toBe('bear');
    });

    it('rejects equipping a badge the user does not own — never trusts the client', async () => {
        const { equipBadge } = await import('./service');
        const result = await equipBadge('alice', 'bull');
        expect(result.status).toBe('not_owned');
        expect(result.equipped).toBeNull();
    });

    it('allows unequipping with sku: null', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        const { buyBadge, equipBadge } = await import('./service');
        await buyBadge('alice', 'bull');
        const result = await equipBadge('alice', null);
        expect(result.status).toBe('equipped');
        expect(result.equipped).toBeNull();
    });
});

describe('getEquippedMap', () => {
    it('returns only users with a non-null equipped badge', async () => {
        accountStore.set('alice', { _id: 'alice', balance: 1000, lifetimeEarned: 1000 });
        accountStore.set('bob', { _id: 'bob', balance: 1000, lifetimeEarned: 1000 });
        const { buyBadge, getEquippedMap } = await import('./service');
        await buyBadge('alice', 'bull'); // auto-equips
        // bob buys nothing
        const map = await getEquippedMap();
        expect(map).toEqual({ alice: 'bull' });
    });
});
