/**
 * Splices discovery candidates into a base feed every `everyN` items.
 * Dedupes by `permlink` against both the base feed and previously-spliced
 * candidates, and never cycles back through candidates once exhausted — a
 * repeated item reappearing lower in the same scroll session is confusing,
 * not helpful. Always returns a new array; never mutates `base`.
 */
export function interleaveCandidates<T extends { permlink: string }>(
    base: T[],
    candidates: T[],
    everyN: number,
): T[] {
    if (!candidates.length || everyN < 1) return base;

    const basePermlinks = new Set(base.map(item => item.permlink));
    const usedCandidatePermlinks = new Set<string>();
    let candidateIndex = 0;

    function nextCandidate(): T | null {
        while (candidateIndex < candidates.length) {
            const candidate = candidates[candidateIndex++];
            if (!basePermlinks.has(candidate.permlink) && !usedCandidatePermlinks.has(candidate.permlink)) {
                usedCandidatePermlinks.add(candidate.permlink);
                return candidate;
            }
        }
        return null;
    }

    const result: T[] = [];
    for (let i = 0; i < base.length; i++) {
        result.push(base[i]);
        if ((i + 1) % everyN === 0) {
            const candidate = nextCandidate();
            if (candidate) result.push(candidate);
        }
    }
    return result;
}

/** Author-qualified identity — permlinks are only unique per author on Hive. */
export interface InterleaveItem {
    author: string;
    permlink: string;
}

const itemKey = (item: InterleaveItem) => `${item.author}/${item.permlink}`;

/**
 * Mutable accumulator for interleaveAppendOnly. Create one with
 * emptyStableInterleave() and keep it alive for the life of a feed view
 * (a React ref); the extend call below mutates it in place.
 */
export interface StableInterleaveState<T extends InterleaveItem> {
    /** Display order, as item keys — the one thing that never reorders. */
    orderedKeys: string[];
    /** Spliced candidates by key, at the version first spliced. */
    splicedByKey: Map<string, T>;
    /** Every base key ever consumed — candidate dedupe target. */
    baseKeysSeen: Set<string>;
    /** How much of `base` has been consumed into orderedKeys. */
    baseConsumed: number;
    /** Key of base[0] at first consumption — a change means the feed was
     *  reset/replaced (refresh), not appended to, so start over. */
    baseFirstKey: string | null;
}

export function emptyStableInterleave<T extends InterleaveItem>(): StableInterleaveState<T> {
    return { orderedKeys: [], splicedByKey: new Map(), baseKeysSeen: new Set(), baseConsumed: 0, baseFirstKey: null };
}

/**
 * Append-only interleave — the fix for interleaveCandidates being recomputed
 * from scratch against a *live* candidate pool. That pool arrives
 * asynchronously (empty on first paint, filled a beat later) and is replaced
 * wholesale by a periodic refetch (useDiscoveryCandidates), so a fresh
 * recompute could change which item sits at an already-rendered position —
 * splicing new rows in above the user's scroll position, or swapping one
 * trending item for another. Under SnapList's Virtuoso those mid-scroll
 * identity shifts relayout everything above the viewport and physically
 * throw the scroll position (the mobile "jumps back to the top" bug).
 *
 * The contract here: once a position has been emitted it is frozen — new
 * base pages and new candidate arrivals only ever *extend* the tail. A
 * candidate pool update therefore only influences positions the user has
 * never seen. Dedupes both directions by author/permlink: a base item that
 * was already spliced as a candidate is skipped when its page arrives, and
 * a candidate already seen in the base is never spliced.
 *
 * Returns the display list, rebuilt each call so `base`'s current objects
 * (fresher votes/payout via refreshComment) win over the frozen splice-time
 * snapshots; only the ordering is frozen, never the data. Detects a feed
 * reset (refresh() emptying/replacing base) via baseFirstKey and starts over.
 */
export function interleaveAppendOnly<T extends InterleaveItem>(
    state: StableInterleaveState<T>,
    base: T[],
    candidates: T[],
    everyN: number,
): T[] {
    const resetNeeded =
        base.length < state.baseConsumed ||
        (state.baseConsumed > 0 && (base.length === 0 || itemKey(base[0]) !== state.baseFirstKey));
    if (resetNeeded) {
        state.orderedKeys = [];
        state.splicedByKey = new Map();
        state.baseKeysSeen = new Set();
        state.baseConsumed = 0;
        state.baseFirstKey = null;
    }
    if (base.length > 0 && state.baseFirstKey === null) state.baseFirstKey = itemKey(base[0]);

    let candidateIndex = 0;
    const nextCandidate = (): T | null => {
        while (candidateIndex < candidates.length) {
            const candidate = candidates[candidateIndex++];
            const key = itemKey(candidate);
            if (!state.baseKeysSeen.has(key) && !state.splicedByKey.has(key)) return candidate;
        }
        return null;
    };

    for (let i = state.baseConsumed; i < base.length; i++) {
        const key = itemKey(base[i]);
        state.baseKeysSeen.add(key);
        if (!state.splicedByKey.has(key)) state.orderedKeys.push(key);
        if (everyN >= 1 && (i + 1) % everyN === 0) {
            const candidate = nextCandidate();
            if (candidate) {
                state.splicedByKey.set(itemKey(candidate), candidate);
                state.orderedKeys.push(itemKey(candidate));
            }
        }
    }
    state.baseConsumed = base.length;

    if (state.splicedByKey.size === 0) return base;

    const baseByKey = new Map(base.map(item => [itemKey(item), item]));
    const result: T[] = [];
    for (const key of state.orderedKeys) {
        const item = baseByKey.get(key) ?? state.splicedByKey.get(key);
        if (item) result.push(item);
    }
    return result;
}
