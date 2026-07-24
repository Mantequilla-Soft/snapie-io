import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same isolated-mock pattern as hiveVerify.test.ts — get_transaction
// responses are driven by this mutable map, keyed by txid, reset in
// beforeEach. POINTS_RECEIVING_ACCOUNT defaults to 'snapie' (no env var set
// in the test environment), so tests target that account directly rather
// than mocking the env.

const txByTxid = new Map<string, { operations: [string, Record<string, unknown>][] }>();
const callLog: { method: string; params: unknown[] }[] = [];

vi.mock('@/lib/hive/hiveclient', () => ({
    default: {
        database: {
            call: vi.fn(async (method: string, params: unknown[]) => {
                callLog.push({ method, params });
                if (method === 'get_transaction') {
                    const [txid] = params as [string];
                    const tx = txByTxid.get(txid);
                    if (!tx) throw new Error('Unknown transaction'); // matches a real node's behavior for an unknown/not-yet-propagated txid
                    return tx;
                }
                return null;
            }),
        },
    },
}));

function setTransaction(txid: string, ops: [string, Record<string, unknown>][]) {
    txByTxid.set(txid, { operations: ops });
}

function transferOp(overrides: Partial<{ from: string; to: string; amount: string; memo: string }> = {}): [string, Record<string, unknown>] {
    return ['transfer', { from: 'alice', to: 'snapie', amount: '5.000 HBD', memo: 'Snapie Points purchase', ...overrides }];
}

beforeEach(() => {
    txByTxid.clear();
    callLog.length = 0;
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

async function runWithRetries<T>(promise: Promise<T>): Promise<T> {
    const advance = vi.advanceTimersByTimeAsync(10_000);
    const [result] = await Promise.all([promise, advance]);
    return result;
}

describe('verifyTransfer', () => {
    it('verifies a matching HBD transfer and returns the on-chain amount', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ from: 'alice', to: 'snapie', amount: '5.000 HBD' })]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toEqual({ hbdAmount: 5 });
    });

    it('never trusts a client amount — the returned amount is always parsed from chain data', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ amount: '12.345 HBD' })]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result?.hbdAmount).toBe(12.345);
    });

    it('rejects when the sender does not match', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ from: 'mallory' })]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toBeNull();
    });

    it('rejects when the transfer went to the wrong account', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ to: 'someone-else' })]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toBeNull();
    });

    it('rejects a HIVE transfer — only HBD is accepted', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ amount: '5.000 HIVE' })]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toBeNull();
    });

    it('is case-insensitive matching the sender/receiver accounts', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ from: 'Alice', to: 'SNAPIE' })]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toEqual({ hbdAmount: 5 });
    });

    it('finds the matching transfer inside a multi-operation (batched) transaction', async () => {
        // Mirrors real chain data: a single transaction can bundle many
        // transfer ops (confirmed against a real commentrewarder batch tx) —
        // the target transfer is not necessarily operation zero.
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [
            transferOp({ from: 'bob', to: 'someone-else', amount: '1.000 HIVE' }),
            transferOp({ from: 'carol', to: 'snapie', amount: '2.000 HBD' }),
            transferOp({ from: 'alice', to: 'snapie', amount: '5.000 HBD' }),
        ]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toEqual({ hbdAmount: 5 });
    });

    it('ignores non-transfer operations in the same transaction', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [
            ['vote', { voter: 'alice', author: 'bob', permlink: 'post', weight: 10000 }],
            transferOp({ from: 'alice', to: 'snapie', amount: '5.000 HBD' }),
        ]);
        const result = await verifyTransfer('tx1', 'alice');
        expect(result).toEqual({ hbdAmount: 5 });
    });

    it('retries on a not-yet-propagated transaction, then succeeds once it appears', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        const promise = verifyTransfer('tx-lagging', 'alice');
        await vi.advanceTimersByTimeAsync(0); // first (zero-delay) attempt sees "not found"
        setTransaction('tx-lagging', [transferOp({ from: 'alice', to: 'snapie', amount: '5.000 HBD' })]);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await promise).toEqual({ hbdAmount: 5 });
    });

    it('gives up as unverified if the transaction never appears', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        const result = await runWithRetries(verifyTransfer('tx-ghost', 'alice'));
        expect(result).toBeNull();
    });

    it('does not keep retrying once a real (non-matching) transaction is found — no point re-querying immutable chain data', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        setTransaction('tx1', [transferOp({ from: 'mallory' })]);
        await runWithRetries(verifyTransfer('tx1', 'alice'));
        // Only the first attempt's call should have happened — found the tx,
        // it didn't match, gave up immediately rather than retrying 2 more times.
        const txCalls = callLog.filter(c => c.method === 'get_transaction');
        expect(txCalls.length).toBe(1);
    });

    it('rejects an empty/missing txid without any network call', async () => {
        const { verifyTransfer } = await import('./purchaseVerify');
        expect(await verifyTransfer('', 'alice')).toBeNull();
        expect(callLog.length).toBe(0);
    });
});
