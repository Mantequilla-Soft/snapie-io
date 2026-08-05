import { describe, it, expect } from 'vitest';
import { hasMutedTag } from './mutedTags';

describe('hasMutedTag', () => {
    it('matches a tag in json_metadata.tags', () => {
        const meta = JSON.stringify({ tags: ['hive', 'scrobblelife'] });
        expect(hasMutedTag(meta, ['scrobblelife'])).toBe(true);
    });

    it('is case-insensitive on both sides', () => {
        const meta = JSON.stringify({ tags: ['ScrobbleLife'] });
        expect(hasMutedTag(meta, ['SCROBBLElife'])).toBe(true);
    });

    it('returns false when no muted tags match', () => {
        const meta = JSON.stringify({ tags: ['hive', 'photography'] });
        expect(hasMutedTag(meta, ['scrobblelife'])).toBe(false);
    });

    it('returns false for an empty mute list', () => {
        const meta = JSON.stringify({ tags: ['scrobblelife'] });
        expect(hasMutedTag(meta, [])).toBe(false);
    });

    it('returns false for missing/undefined json_metadata', () => {
        expect(hasMutedTag(undefined, ['scrobblelife'])).toBe(false);
    });

    it('returns false for malformed JSON instead of throwing', () => {
        expect(hasMutedTag('{not valid json', ['scrobblelife'])).toBe(false);
    });

    it('returns false when tags is missing or not an array', () => {
        expect(hasMutedTag(JSON.stringify({}), ['scrobblelife'])).toBe(false);
        expect(hasMutedTag(JSON.stringify({ tags: 'scrobblelife' }), ['scrobblelife'])).toBe(false);
    });

    it('matches when json_metadata is already a parsed object (bridge_api shape)', () => {
        // bridge_api.get_ranked_posts/get_account_posts (used by findPosts,
        // findFeedPosts) return json_metadata pre-parsed as an object, unlike
        // condenser_api/database_api which return the raw JSON string.
        expect(hasMutedTag({ tags: ['devlog', 'hive'] }, ['devlog'])).toBe(true);
        expect(hasMutedTag({ tags: ['devlog'] }, ['scrobblelife'])).toBe(false);
    });
});
