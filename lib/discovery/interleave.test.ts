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
