import { describe, it, expect } from 'vitest';
import { getPayoutValue } from './client-functions';

describe('getPayoutValue', () => {
    it('uses the Bridge API payout field directly when present', () => {
        expect(getPayoutValue({ created: '2026-01-01T00:00:00', payout: 1.234 })).toBe('1.234');
    });

    it('uses pending_payout_value for a post inside the 7-day window', () => {
        const created = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
        expect(getPayoutValue({
            created,
            pending_payout_value: '0.500 HBD',
            total_payout_value: '0.000 HBD',
        })).toBe('0.500');
    });

    // Regression test — confirmed against a real post: we showed $0.252
    // (author-only total_payout_value), PeakD showed $0.50. Post-cashout,
    // Hive splits the pot into total_payout_value (author) +
    // curator_payout_value (curators) — showing author-only under-reports
    // the real payout by roughly half whenever curators earned a
    // comparable share to the author.
    it('sums total_payout_value + curator_payout_value once the window has closed', () => {
        const created = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
        expect(getPayoutValue({
            created,
            pending_payout_value: '0.000 HBD',
            total_payout_value: '0.252 HBD',
            curator_payout_value: '0.251 HBD',
        })).toBe('0.503');
    });

    // Regression test — confirmed live on a real snap (@beelzael): a post
    // whose true UTC age is just past 7 days (7.16 days here) parsed as
    // under 7 days when `created` (no trailing 'Z', per Hive convention)
    // was treated as local time on a UTC-5 system, incorrectly returning
    // the now-empty pending_payout_value instead of the real payout.
    it('does not misparse a Z-less timestamp as local time near the 7-day boundary', () => {
        const trueAgeMs = 7.16 * 24 * 60 * 60 * 1000;
        const created = new Date(Date.now() - trueAgeMs).toISOString().replace('Z', '');
        expect(getPayoutValue({
            created,
            pending_payout_value: '0.000 HBD',
            total_payout_value: '0.252 HBD',
            curator_payout_value: '0.251 HBD',
        })).toBe('0.503');
    });

    it('treats a missing curator_payout_value as zero (no NaN)', () => {
        const created = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().replace('Z', '');
        expect(getPayoutValue({
            created,
            total_payout_value: '0.252 HBD',
        })).toBe('0.252');
    });

    it('returns 0.000 when created is missing', () => {
        expect(getPayoutValue({})).toBe('0.000');
    });
});
