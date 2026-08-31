import { describe, it, expect } from 'vitest';
import { interleaveCandidates } from './interleave';

function items(permlinks: string[]) {
    return permlinks.map(permlink => ({ permlink }));
}

describe('interleaveCandidates', () => {
    it('splices one candidate every N items', () => {
        const base = items(['b1', 'b2', 'b3', 'b4', 'b5']);
        const candidates = items(['c1', 'c2']);
        const result = interleaveCandidates(base, candidates, 2);
        expect(result.map(r => r.permlink)).toEqual(['b1', 'b2', 'c1', 'b3', 'b4', 'c2', 'b5']);
    });

    it('does not cycle candidates once exhausted', () => {
        const base = items(['b1', 'b2', 'b3', 'b4']);
        const candidates = items(['c1']);
        const result = interleaveCandidates(base, candidates, 1);
        expect(result.map(r => r.permlink)).toEqual(['b1', 'c1', 'b2', 'b3', 'b4']);
    });

    it('dedupes a candidate that is already in the base feed', () => {
        const base = items(['b1', 'b2']);
        const candidates = items(['b2', 'c1']);
        const result = interleaveCandidates(base, candidates, 1);
        expect(result.map(r => r.permlink)).toEqual(['b1', 'c1', 'b2']);
    });

    it('never inserts the same candidate twice', () => {
        const base = items(['b1', 'b2', 'b3']);
        const candidates = items(['c1', 'c1']);
        const result = interleaveCandidates(base, candidates, 1);
        expect(result.map(r => r.permlink)).toEqual(['b1', 'c1', 'b2', 'b3']);
    });

    it('returns the base unchanged when there are no candidates', () => {
        const base = items(['b1', 'b2']);
        expect(interleaveCandidates(base, [], 2)).toEqual(base);
    });

    it('never mutates the base array', () => {
        const base = items(['b1', 'b2']);
        const original = [...base];
        interleaveCandidates(base, items(['c1']), 1);
        expect(base).toEqual(original);
    });
});

import { interleaveAppendOnly, emptyStableInterleave } from './interleave';

function keyed(keys: string[]) {
    return keys.map(k => ({ author: 'a', permlink: k }));
}

const permlinks = (result: { permlink: string }[]) => result.map(r => r.permlink);

describe('interleaveAppendOnly', () => {
    it('matches interleaveCandidates layout on a single pass', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string }>();
        const result = interleaveAppendOnly(state, keyed(['b1', 'b2', 'b3', 'b4', 'b5']), keyed(['c1', 'c2']), 2);
        expect(permlinks(result)).toEqual(['b1', 'b2', 'c1', 'b3', 'b4', 'c2', 'b5']);
    });

    it('a late-arriving candidate pool never disturbs already-emitted positions', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string }>();
        const base = keyed(['b1', 'b2', 'b3', 'b4']);
        // First render: pool not fetched yet.
        const first = interleaveAppendOnly(state, base, [], 2);
        expect(permlinks(first)).toEqual(['b1', 'b2', 'b3', 'b4']);
        // Pool lands. Consumed positions must not change...
        const second = interleaveAppendOnly(state, base, keyed(['c1']), 2);
        expect(permlinks(second)).toEqual(['b1', 'b2', 'b3', 'b4']);
        // ...but a newly appended page interleaves from the live pool.
        const third = interleaveAppendOnly(state, [...base, ...keyed(['b5', 'b6'])], keyed(['c1']), 2);
        expect(permlinks(third)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'c1']);
    });

    it('a wholesale pool replacement cannot swap an already-spliced item', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string }>();
        const base = keyed(['b1', 'b2']);
        const first = interleaveAppendOnly(state, base, keyed(['c1']), 2);
        expect(permlinks(first)).toEqual(['b1', 'b2', 'c1']);
        // Refetched pool no longer contains c1 — c1 must stay where it was.
        const second = interleaveAppendOnly(state, base, keyed(['c9']), 2);
        expect(permlinks(second)).toEqual(['b1', 'b2', 'c1']);
    });

    it('skips a base arrival already shown as a spliced candidate', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string }>();
        const first = interleaveAppendOnly(state, keyed(['b1', 'b2']), keyed(['x']), 2);
        expect(permlinks(first)).toEqual(['b1', 'b2', 'x']);
        // 'x' later walks into the base feed itself — no duplicate row.
        const second = interleaveAppendOnly(state, keyed(['b1', 'b2', 'x', 'b3']), keyed(['x']), 2);
        expect(permlinks(second)).toEqual(['b1', 'b2', 'x', 'b3']);
    });

    it('serves fresh base objects while keeping the frozen order', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string; payout?: number }>();
        const base = [{ author: 'a', permlink: 'b1', payout: 0 }];
        interleaveAppendOnly(state, base, [], 2);
        const refreshed = [{ author: 'a', permlink: 'b1', payout: 42 }];
        // splicedByKey empty -> passthrough; force a splice to exercise the rebuild path
        const withSplice = interleaveAppendOnly(state, [...refreshed, { author: 'a', permlink: 'b2' }], [{ author: 'a', permlink: 'c1' }], 2);
        expect(withSplice[0]).toMatchObject({ permlink: 'b1', payout: 42 });
    });

    it('detects a feed reset and starts over', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string }>();
        interleaveAppendOnly(state, keyed(['b1', 'b2', 'b3']), keyed(['c1']), 2);
        // refresh() replaced the feed with entirely new content
        const result = interleaveAppendOnly(state, keyed(['n1', 'n2']), keyed(['c2']), 2);
        expect(permlinks(result)).toEqual(['n1', 'n2', 'c2']);
    });

    it('distinguishes same permlink under different authors', () => {
        const state = emptyStableInterleave<{ author: string; permlink: string }>();
        const base = [{ author: 'alice', permlink: 'p' }, { author: 'bob', permlink: 'q' }];
        const candidates = [{ author: 'carol', permlink: 'p' }];
        const result = interleaveAppendOnly(state, base, candidates, 2);
        expect(result.map(r => `${r.author}/${r.permlink}`)).toEqual(['alice/p', 'bob/q', 'carol/p']);
    });
});
