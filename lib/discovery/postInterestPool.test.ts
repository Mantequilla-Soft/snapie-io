import { describe, it, expect } from 'vitest';
import { filterAndRankPosts } from './postInterestPool';
import type { Discussion } from '@hiveio/dhive';

const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

function makePost(overrides: Partial<Discussion>): Discussion {
    return {
        author: 'someone',
        permlink: 'p1',
        title: 'A post',
        created: new Date(NOW - 60 * 60 * 1000).toISOString(), // 1 hour old by default
        children: 0,
        ...overrides,
    } as Discussion;
}

describe('filterAndRankPosts', () => {
    it('excludes candidates whose categories do not intersect the requested tags', () => {
        const posts = [
            makePost({ permlink: 'travel-post', author: 'a' }),
            makePost({ permlink: 'cooking-post', author: 'b' }),
        ];
        const categoryMap = new Map([
            ['a/travel-post', ['travel']],
            ['b/cooking-post', ['food']],
        ]);
        const ranked = filterAndRankPosts(posts, ['travel'], categoryMap, NOW);
        expect(ranked.map(r => r.permlink)).toEqual(['travel-post']);
    });

    it('includes a candidate matching any one of multiple requested tags', () => {
        const posts = [makePost({ permlink: 'p1', author: 'a' })];
        const categoryMap = new Map([['a/p1', ['music', 'gaming']]]);
        const ranked = filterAndRankPosts(posts, ['travel', 'gaming'], categoryMap, NOW);
        expect(ranked).toHaveLength(1);
    });

    it('excludes candidates with no category data at all', () => {
        const posts = [makePost({ permlink: 'p1', author: 'a' })];
        const ranked = filterAndRankPosts(posts, ['travel'], new Map(), NOW);
        expect(ranked).toHaveLength(0);
    });

    it('ranks matching candidates by velocity, not raw comment count', () => {
        const posts = [
            makePost({ permlink: 'old-popular', author: 'a', children: 20, created: new Date(NOW - 40 * 60 * 60 * 1000).toISOString() }),
            makePost({ permlink: 'young-hot', author: 'b', children: 8, created: new Date(NOW - 60 * 60 * 1000).toISOString() }),
        ];
        const categoryMap = new Map([
            ['a/old-popular', ['travel']],
            ['b/young-hot', ['travel']],
        ]);
        const ranked = filterAndRankPosts(posts, ['travel'], categoryMap, NOW);
        expect(ranked[0].permlink).toBe('young-hot');
    });

    it('handles posts with no children field without throwing', () => {
        const post = makePost({ permlink: 'p1', author: 'a' });
        delete (post as { children?: number }).children;
        const categoryMap = new Map([['a/p1', ['travel']]]);
        expect(() => filterAndRankPosts([post], ['travel'], categoryMap, NOW)).not.toThrow();
    });
});
