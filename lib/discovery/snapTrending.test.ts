import { describe, it, expect } from 'vitest';
import { computeVelocityScore, rankSnapCandidates, rankForYouCandidates, isWithinDiscoveryWindow } from './snapTrending';
import type { ExtendedComment } from '@/hooks/useComments';

const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

function makeSnap(overrides: Partial<ExtendedComment>): ExtendedComment {
    return {
        author: 'someone',
        permlink: 'p1',
        created: new Date(NOW - 60 * 60 * 1000).toISOString(), // 1 hour old by default
        children: 0,
        ...overrides,
    } as ExtendedComment;
}

describe('computeVelocityScore', () => {
    it('is higher for more comments at the same age', () => {
        const low = computeVelocityScore(2, new Date(NOW - 60 * 60 * 1000).toISOString(), NOW);
        const high = computeVelocityScore(20, new Date(NOW - 60 * 60 * 1000).toISOString(), NOW);
        expect(high).toBeGreaterThan(low);
    });

    it('is higher for the same comments at a younger age', () => {
        const older = computeVelocityScore(10, new Date(NOW - 4 * 60 * 60 * 1000).toISOString(), NOW);
        const younger = computeVelocityScore(10, new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), NOW);
        expect(younger).toBeGreaterThan(older);
    });

    it('does not divide by (near) zero for a just-posted snap', () => {
        const score = computeVelocityScore(1, new Date(NOW - 1000).toISOString(), NOW);
        expect(Number.isFinite(score)).toBe(true);
    });
});

describe('rankSnapCandidates', () => {
    it('ranks by velocity, not raw comment count', () => {
        const items = [
            makeSnap({ permlink: 'old-popular', children: 20, created: new Date(NOW - 40 * 60 * 60 * 1000).toISOString() }),
            makeSnap({ permlink: 'young-hot', children: 8, created: new Date(NOW - 60 * 60 * 1000).toISOString() }),
        ];
        const ranked = rankSnapCandidates(items, 10, new Set(), NOW);
        expect(ranked[0].permlink).toBe('young-hot');
    });

    it('excludes candidates authored by a muted account', () => {
        const items = [
            makeSnap({ permlink: 'from-muted', author: 'spammer', children: 50 }),
            makeSnap({ permlink: 'from-clean', author: 'ok-author', children: 1 }),
        ];
        const ranked = rankSnapCandidates(items, 10, new Set(['spammer']), NOW);
        expect(ranked.map(r => r.permlink)).toEqual(['from-clean']);
    });

    it('excludes snaps younger than the minimum age window (no signal yet)', () => {
        const items = [makeSnap({ children: 100, created: new Date(NOW - 60 * 1000).toISOString() })]; // 1 minute old
        expect(rankSnapCandidates(items, 10, new Set(), NOW)).toHaveLength(0);
    });

    it('excludes snaps older than the max age window (Phase 1 is not resurrection)', () => {
        const items = [makeSnap({ children: 100, created: new Date(NOW - 72 * 60 * 60 * 1000).toISOString() })]; // 72h old
        expect(rankSnapCandidates(items, 10, new Set(), NOW)).toHaveLength(0);
    });

    it('respects the limit', () => {
        const items = Array.from({ length: 5 }, (_, i) =>
            makeSnap({ permlink: `p${i}`, children: i + 1 }));
        expect(rankSnapCandidates(items, 2, new Set(), NOW)).toHaveLength(2);
    });

    it('tags results as discovery/trending', () => {
        const items = [makeSnap({ children: 5 })];
        const [ranked] = rankSnapCandidates(items, 10, new Set(), NOW);
        expect(ranked.isDiscovery).toBe(true);
        expect(ranked.discoveryReason).toBe('trending');
    });
});

describe('isWithinDiscoveryWindow', () => {
    // Regression test — confirmed live on the real (server runs UTC-5) pool:
    // a snap whose true UTC age was 52.8 hours still passed the 48-hour
    // cutoff, because `created` (no trailing 'Z', per Hive convention) was
    // parsed as local time instead of UTC, undercounting its age by the
    // server's UTC offset. Same class of bug already fixed once for payout
    // display and once for blog date boundaries — this is the discovery
    // pipeline's copy of it.
    it('does not misparse a Z-less timestamp as local time near the 48-hour boundary', () => {
        const trueAgeMs = 52.8 * 60 * 60 * 1000;
        const created = new Date(NOW - trueAgeMs).toISOString().replace('Z', ''); // no trailing Z, like real Hive data
        expect(isWithinDiscoveryWindow(created, NOW)).toBe(false);
    });

    it('accepts a Z-less timestamp genuinely inside the window', () => {
        const trueAgeMs = 10 * 60 * 60 * 1000;
        const created = new Date(NOW - trueAgeMs).toISOString().replace('Z', '');
        expect(isWithinDiscoveryWindow(created, NOW)).toBe(true);
    });
});

describe('rankForYouCandidates', () => {
    it('ranks by velocity, same as rankSnapCandidates', () => {
        const items = [
            makeSnap({ permlink: 'old-popular', children: 20, created: new Date(NOW - 40 * 60 * 60 * 1000).toISOString() }),
            makeSnap({ permlink: 'young-hot', children: 8, created: new Date(NOW - 60 * 60 * 1000).toISOString() }),
        ];
        const ranked = rankForYouCandidates(items, 10, new Set(), NOW);
        expect(ranked[0].permlink).toBe('young-hot');
    });

    it('excludes candidates authored by a muted account', () => {
        const items = [
            makeSnap({ permlink: 'from-muted', author: 'spammer', children: 50 }),
            makeSnap({ permlink: 'from-clean', author: 'ok-author', children: 1 }),
        ];
        const ranked = rankForYouCandidates(items, 10, new Set(['spammer']), NOW);
        expect(ranked.map(r => r.permlink)).toEqual(['from-clean']);
    });

    it('does NOT tag results as discovery/trending, unlike rankSnapCandidates', () => {
        const items = [makeSnap({ children: 5 })];
        const [ranked] = rankForYouCandidates(items, 10, new Set(), NOW);
        expect(ranked.isDiscovery).toBeUndefined();
        expect(ranked.discoveryReason).toBeUndefined();
    });
});
