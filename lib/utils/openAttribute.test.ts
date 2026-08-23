import { describe, it, expect } from 'vitest';
import { snapOpenAttributeKey } from './openAttribute';

describe('snapOpenAttributeKey', () => {
    it('tags a new top-level snap as snapie.snap', () => {
        expect(snapOpenAttributeKey(true)).toBe('snapie.snap');
    });

    it('tags a reply (to a snap, a blog post, or a Short) as snapie.reply', () => {
        expect(snapOpenAttributeKey(false)).toBe('snapie.reply');
    });
});
