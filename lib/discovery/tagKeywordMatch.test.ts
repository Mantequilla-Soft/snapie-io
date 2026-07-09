import { describe, it, expect } from 'vitest';
import { matchTagsToCategories } from './tagKeywordMatch';

function meta(tags: string[]): string {
    return JSON.stringify({ tags });
}

describe('matchTagsToCategories', () => {
    it('matches a direct category-slug hashtag', () => {
        expect(matchTagsToCategories(meta(['travel']))).toEqual(['travel']);
    });

    it('matches a keyword synonym, not just the exact slug', () => {
        expect(matchTagsToCategories(meta(['gardening']))).toEqual(['homesteading']);
    });

    it('is case-insensitive', () => {
        expect(matchTagsToCategories(meta(['Travel', 'GARDENING']))).toEqual(
            expect.arrayContaining(['travel', 'homesteading']),
        );
    });

    it('returns multiple distinct categories when multiple hashtags match', () => {
        const result = matchTagsToCategories(meta(['travel', 'gaming', 'unrelated']));
        expect(result.sort()).toEqual(['gaming', 'travel']);
    });

    it('deduplicates when multiple hashtags map to the same category', () => {
        const result = matchTagsToCategories(meta(['travel', 'trip', 'tourism']));
        expect(result).toEqual(['travel']);
    });

    it('returns empty for hashtags matching nothing', () => {
        expect(matchTagsToCategories(meta(['randomstuff', 'whatever']))).toEqual([]);
    });

    it('returns empty for missing json_metadata', () => {
        expect(matchTagsToCategories(undefined)).toEqual([]);
    });

    it('returns empty for malformed json_metadata rather than throwing', () => {
        expect(() => matchTagsToCategories('not json')).not.toThrow();
        expect(matchTagsToCategories('not json')).toEqual([]);
    });

    it('returns empty when tags field is missing or not an array', () => {
        expect(matchTagsToCategories(JSON.stringify({}))).toEqual([]);
        expect(matchTagsToCategories(JSON.stringify({ tags: 'travel' }))).toEqual([]);
    });
});
