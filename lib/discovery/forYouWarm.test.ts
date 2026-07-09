import { describe, it, expect } from 'vitest';
import { filterAndRankByCategory } from './forYouWarm';
import type { ExtendedComment } from '@/hooks/useComments';

const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

function makeItem(overrides: Partial<ExtendedComment> & { tags?: string[] }): ExtendedComment {
    const { tags, ...rest } = overrides;
    return {
        author: 'someone',
        permlink: 'p1',
        created: new Date(NOW - 60 * 60 * 1000).toISOString(), // 1 hour old by default
        children: 0,
        json_metadata: JSON.stringify({ tags: tags ?? [] }),
        ...rest,
    } as ExtendedComment;
}

describe('filterAndRankByCategory', () => {
    it('excludes candidates whose hashtags do not match the requested tags', () => {
        const items = [
            makeItem({ permlink: 'travel-post', tags: ['travel', 'photography'] }),
            makeItem({ permlink: 'cooking-post', tags: ['food', 'recipe'] }),
        ];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked.map(r => r.permlink)).toEqual(['travel-post']);
    });

    it('includes a candidate matching any one of multiple requested tags', () => {
        const items = [makeItem({ permlink: 'p1', tags: ['music', 'gaming'] })];
        const ranked = filterAndRankByCategory(items, ['travel', 'gaming'], NOW);
        expect(ranked).toHaveLength(1);
    });

    it('excludes candidates with no matching hashtags at all', () => {
        const items = [makeItem({ permlink: 'p1', tags: ['random', 'unrelated'] })];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked).toHaveLength(0);
    });

    it('excludes candidates with no tags / malformed metadata', () => {
        const malformed = makeItem({ permlink: 'p2' });
        malformed.json_metadata = 'not json';
        const items = [makeItem({ permlink: 'p1', tags: [] }), malformed];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked).toHaveLength(0);
    });

    it('ranks matching candidates by velocity, not raw comment count', () => {
        const items = [
            makeItem({ permlink: 'old-popular', tags: ['travel'], children: 20, created: new Date(NOW - 40 * 60 * 60 * 1000).toISOString() }),
            makeItem({ permlink: 'young-hot', tags: ['travel'], children: 8, created: new Date(NOW - 60 * 60 * 1000).toISOString() }),
        ];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked[0].permlink).toBe('young-hot');
    });

    it('tags results as discovery/category-match', () => {
        const items = [makeItem({ permlink: 'p1', tags: ['travel'] })];
        const [ranked] = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked.isDiscovery).toBe(true);
        expect(ranked.discoveryReason).toBe('category-match');
    });

    it('matches hashtags case-insensitively', () => {
        const items = [makeItem({ permlink: 'p1', tags: ['Travel', 'PHOTOGRAPHY'] })];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked).toHaveLength(1);
    });

    it('handles items with no children field (sidecar wave items) without throwing', () => {
        const item = makeItem({ permlink: 'p1', tags: ['travel'] });
        delete (item as { children?: number }).children;
        expect(() => filterAndRankByCategory([item], ['travel'], NOW)).not.toThrow();
    });

    // Regression test — confirmed live: the warm pool had no age ceiling at
    // all, so an old post that had accumulated a lot of replies over days
    // could sit at #1 indefinitely (observed: an 8.8-day-old item ranked
    // above a 5-hour-old one). Without this window, "For You" never feels
    // like it moves even while the plain chronological feed is full of
    // brand-new content.
    it('excludes candidates older than the 48-hour discovery window, even high-scoring ones', () => {
        const items = [
            makeItem({ permlink: 'week-old-popular', tags: ['travel'], children: 80, created: new Date(NOW - 211 * 60 * 60 * 1000).toISOString() }),
            makeItem({ permlink: 'fresh', tags: ['travel'], children: 1, created: new Date(NOW - 5 * 60 * 60 * 1000).toISOString() }),
        ];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked.map(r => r.permlink)).toEqual(['fresh']);
    });

    it('excludes candidates younger than the 15-minute minimum age (matches Trending)', () => {
        const items = [makeItem({ permlink: 'brand-new', tags: ['travel'], children: 5, created: new Date(NOW - 60 * 1000).toISOString() })];
        const ranked = filterAndRankByCategory(items, ['travel'], NOW);
        expect(ranked).toHaveLength(0);
    });
});
