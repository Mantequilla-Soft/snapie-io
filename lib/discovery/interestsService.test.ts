import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeDoc {
    username: string;
    interestTags: string[];
    interestsOnboardedAt: Date;
}

let store: Map<string, FakeDoc> = new Map();

vi.mock('@/lib/db/mongodb', () => ({
    connectDB: vi.fn(async () => {}),
}));

vi.mock('@/lib/db/models/UserInterests', () => ({
    UserInterests: {
        findById: (username: string) => ({
            lean: async () => store.get(username) ?? null,
        }),
        findByIdAndUpdate: (username: string, update: { $set: { interestTags: string[]; interestsOnboardedAt: Date } }) => ({
            then: (resolve: (v: unknown) => void) => {
                store.set(username, { username, ...update.$set });
                resolve(undefined);
            },
        }),
    },
}));

const isNewHiveAccountMock = vi.fn();
vi.mock('@/lib/discovery/newAccountCheck', () => ({
    isNewHiveAccount: (...args: unknown[]) => isNewHiveAccountMock(...args),
}));

beforeEach(() => {
    store = new Map();
    isNewHiveAccountMock.mockReset();
    isNewHiveAccountMock.mockResolvedValue(false);
});

describe('getInterestsState', () => {
    it('returns empty/never-onboarded defaults for an account with no record', async () => {
        const { getInterestsState } = await import('./interestsService');
        const state = await getInterestsState('nobody');
        expect(state).toEqual({ interestTags: [], interestsOnboardedAt: null, isNewAccount: false });
    });

    it('reflects a saved record', async () => {
        const onboardedAt = new Date('2026-01-01T00:00:00Z');
        store.set('meno', { username: 'meno', interestTags: ['finance', 'gaming'], interestsOnboardedAt: onboardedAt });
        const { getInterestsState } = await import('./interestsService');
        const state = await getInterestsState('meno');
        expect(state.interestTags).toEqual(['finance', 'gaming']);
        expect(state.interestsOnboardedAt).toEqual(onboardedAt);
    });

    it('surfaces isNewAccount from isNewHiveAccount', async () => {
        isNewHiveAccountMock.mockResolvedValue(true);
        const { getInterestsState } = await import('./interestsService');
        const state = await getInterestsState('freshaccount');
        expect(state.isNewAccount).toBe(true);
        expect(isNewHiveAccountMock).toHaveBeenCalledWith('freshaccount');
    });
});

describe('saveInterests', () => {
    it('upserts interestTags and stamps interestsOnboardedAt', async () => {
        const { saveInterests, getInterestsState } = await import('./interestsService');
        await saveInterests('newuser', ['music', 'art']);
        const state = await getInterestsState('newuser');
        expect(state.interestTags).toEqual(['music', 'art']);
        expect(state.interestsOnboardedAt).toBeInstanceOf(Date);
    });

    it('overwrites a previous save (idempotent on repeated calls, last write wins)', async () => {
        const { saveInterests, getInterestsState } = await import('./interestsService');
        await saveInterests('repeat', ['finance']);
        await saveInterests('repeat', []);
        const state = await getInterestsState('repeat');
        expect(state.interestTags).toEqual([]);
        expect(state.interestsOnboardedAt).toBeInstanceOf(Date);
    });
});
