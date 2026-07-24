import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserReputationMock = vi.fn();
vi.mock('@/lib/utils/reputation', () => ({
    getUserReputation: (...args: unknown[]) => getUserReputationMock(...args),
}));

beforeEach(() => {
    getUserReputationMock.mockReset();
});

describe('isNewHiveAccount', () => {
    it('treats a brand-new account (reputation 25) as new', async () => {
        getUserReputationMock.mockResolvedValue(25);
        const { isNewHiveAccount } = await import('./newAccountCheck');
        expect(await isNewHiveAccount('freshaccount')).toBe(true);
    });

    it('treats reputation at the threshold boundary (30) as still new', async () => {
        getUserReputationMock.mockResolvedValue(30);
        const { isNewHiveAccount } = await import('./newAccountCheck');
        expect(await isNewHiveAccount('atboundary')).toBe(true);
    });

    it('treats reputation just above the threshold (31) as not new', async () => {
        getUserReputationMock.mockResolvedValue(31);
        const { isNewHiveAccount } = await import('./newAccountCheck');
        expect(await isNewHiveAccount('pastboundary')).toBe(false);
    });

    it('treats an established account (rep ~79) as not new', async () => {
        getUserReputationMock.mockResolvedValue(79);
        const { isNewHiveAccount } = await import('./newAccountCheck');
        expect(await isNewHiveAccount('veteran')).toBe(false);
    });

    it('treats a negative-reputation (flagged/downvoted) account as new too — the threshold is a simple ceiling, not a spam filter', async () => {
        getUserReputationMock.mockResolvedValue(-5);
        const { isNewHiveAccount } = await import('./newAccountCheck');
        expect(await isNewHiveAccount('flagged')).toBe(true);
    });
});
