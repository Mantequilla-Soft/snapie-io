import { describe, it, expect, beforeAll } from 'vitest';
import type { ExtendedComment } from '@/hooks/useComments';

// Separate file, dynamic import after stubbing the env var: isSnapieCommunityPost
// (used by backfillWithCommunityContent) reads NEXT_PUBLIC_HIVE_COMMUNITY_TAG as
// a module-load-time constant in snapTrending.ts — vitest doesn't auto-load
// .env.local, so it must be set before that module first evaluates, not just
// before each test runs.
const COMMUNITY_TAG = 'hive-167980';

const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

function makeItem(overrides: Partial<ExtendedComment> & { communityTagged?: boolean }): ExtendedComment {
    const { communityTagged, ...rest } = overrides;
    return {
        author: 'someone',
        permlink: 'p1',
        created: new Date(NOW - 60 * 60 * 1000).toISOString(),
        children: 1,
        json_metadata: JSON.stringify({ tags: communityTagged ? [COMMUNITY_TAG] : ['unrelated'] }),
        ...rest,
    } as ExtendedComment;
}

let backfillWithCommunityContent: typeof import('./forYouWarm').backfillWithCommunityContent;

beforeAll(async () => {
    process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG = COMMUNITY_TAG;
    ({ backfillWithCommunityContent } = await import('./forYouWarm'));
});

describe('backfillWithCommunityContent', () => {
    it('fills with community-scoped content when the interest-matched pool ran thin', () => {
        const pool = [
            makeItem({ permlink: 'community-1', communityTagged: true }),
            makeItem({ permlink: 'community-2', communityTagged: true }),
            makeItem({ permlink: 'not-community', communityTagged: false }),
        ];
        const fallback = backfillWithCommunityContent(pool, new Set(), 10, NOW);
        expect(fallback.map(f => f.permlink).sort()).toEqual(['community-1', 'community-2']);
    });

    it('excludes posts already present in the interest-matched results', () => {
        const pool = [
            makeItem({ permlink: 'already-matched', communityTagged: true }),
            makeItem({ permlink: 'still-available', communityTagged: true }),
        ];
        const fallback = backfillWithCommunityContent(pool, new Set(['someone/already-matched']), 10, NOW);
        expect(fallback.map(f => f.permlink)).toEqual(['still-available']);
    });

    it('respects the limit', () => {
        const pool = Array.from({ length: 5 }, (_, i) => makeItem({ permlink: `p${i}`, communityTagged: true }));
        const fallback = backfillWithCommunityContent(pool, new Set(), 2, NOW);
        expect(fallback).toHaveLength(2);
    });

    it('returns nothing when the matched pool already filled the target size', () => {
        const pool = [makeItem({ permlink: 'p1', communityTagged: true })];
        expect(backfillWithCommunityContent(pool, new Set(), 0, NOW)).toEqual([]);
    });

    it('tags results as discovery/community-fallback, distinct from a real interest match', () => {
        const pool = [makeItem({ permlink: 'p1', communityTagged: true })];
        const [fallback] = backfillWithCommunityContent(pool, new Set(), 10, NOW);
        expect(fallback.isDiscovery).toBe(true);
        expect(fallback.discoveryReason).toBe('community-fallback');
    });
});
