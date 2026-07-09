import { describe, it, expect } from 'vitest';
import { computeBurstScore } from './contentResurrection';

const NOW = new Date('2026-07-09T12:00:00.000Z').getTime();

function hoursAgo(hours: number): string {
    return new Date(NOW - hours * 60 * 60 * 1000).toISOString();
}

describe('computeBurstScore', () => {
    it('does not flag a post whose replies are spread evenly with no recent spike', () => {
        // 100 days old, 20 replies spread evenly across its whole life —
        // none of them landed in the last 24h.
        const replies = Array.from({ length: 20 }, (_, i) => hoursAgo(100 * 24 - i * 5 * 24));
        const result = computeBurstScore(replies, hoursAgo(100 * 24), NOW);
        expect(result.isBurst).toBe(false);
        expect(result.recentReplyCount).toBe(0);
    });

    it('flags a genuine spike against the post\'s own baseline', () => {
        // 60 days old, had 2 replies total in its first ~59 days (slow),
        // then 5 more replies landed in the last 12 hours.
        const replies = [
            hoursAgo(58 * 24),
            hoursAgo(50 * 24),
            hoursAgo(10),
            hoursAgo(8),
            hoursAgo(6),
            hoursAgo(4),
            hoursAgo(2),
        ];
        const result = computeBurstScore(replies, hoursAgo(60 * 24), NOW);
        expect(result.isBurst).toBe(true);
        expect(result.recentReplyCount).toBe(5);
    });

    it('qualifies a previously-dead post (zero baseline replies) that suddenly gets real engagement', () => {
        const replies = [hoursAgo(10), hoursAgo(6), hoursAgo(2)];
        const result = computeBurstScore(replies, hoursAgo(90 * 24), NOW);
        expect(result.baselineRate).toBe(0);
        expect(result.isBurst).toBe(true);
    });

    it('does not flag a single recent reply even on an otherwise-dead post (absolute floor)', () => {
        const replies = [hoursAgo(5)];
        const result = computeBurstScore(replies, hoursAgo(90 * 24), NOW);
        expect(result.recentReplyCount).toBe(1);
        expect(result.isBurst).toBe(false);
    });

    it('excludes content still inside the existing 48h Trending/For You window', () => {
        const replies = [hoursAgo(10), hoursAgo(8), hoursAgo(6)];
        const result = computeBurstScore(replies, hoursAgo(20), NOW); // 20h old post
        expect(result.isBurst).toBe(false);
    });

    it('excludes content older than the 1-year dormancy boundary', () => {
        const replies = [hoursAgo(10), hoursAgo(8), hoursAgo(6)];
        const result = computeBurstScore(replies, hoursAgo(400 * 24), NOW); // ~400 days old
        expect(result.isBurst).toBe(false);
    });

    // Regression test — same class of bug fixed twice already this session
    // (payout display, discovery pool windowing): Hive's created timestamps
    // omit the trailing 'Z', so parsing without normalization reads them as
    // local time. Confirms computeBurstScore's age/recency math is immune,
    // via the shared parseHiveTimestamp helper.
    it('does not misparse Z-less timestamps near the burst-window boundary', () => {
        const postCreated = new Date(NOW - 100 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
        const replies = [
            new Date(NOW - 10 * 60 * 60 * 1000).toISOString().replace('Z', ''),
            new Date(NOW - 8 * 60 * 60 * 1000).toISOString().replace('Z', ''),
            new Date(NOW - 6 * 60 * 60 * 1000).toISOString().replace('Z', ''),
        ];
        const result = computeBurstScore(replies, postCreated, NOW);
        expect(result.recentReplyCount).toBe(3);
        expect(result.isBurst).toBe(true);
    });
});
