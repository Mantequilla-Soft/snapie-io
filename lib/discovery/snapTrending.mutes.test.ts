import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExtendedComment } from '@/hooks/useComments';

// Isolated from snapTrending.test.ts on purpose: this file needs to mock
// HiveClient + mutedAccountsManager, and fetchTrendingSnapCandidates/
// fetchForYouSnapCandidates cache their result at module scope — a fresh
// module registry per test file (vitest's default) keeps that cache from
// leaking into or being polluted by unrelated tests.

const CONTAINER = { author: 'peak.snaps', permlink: 'container-1', created: '2026-07-08T10:00:00' };

const REPLIES: Partial<ExtendedComment>[] = [
    {
        author: 'goodauthor',
        permlink: 'r1',
        created: '2026-07-07T12:00:00', // ~22h before NOW below, inside the 48h window
        children: 5,
    },
    {
        author: 'personallymutedauthor',
        permlink: 'r2',
        created: '2026-07-07T12:00:00',
        children: 10,
    },
];

vi.mock('@/lib/hive/hiveclient', () => ({
    default: {
        database: {
            call: vi.fn(async (method: string, _params: unknown[]) => {
                if (method === 'get_discussions_by_author_before_date') {
                    // First call returns the one fixture container; every
                    // subsequent call returns empty so the raw-pool walk's
                    // while loop breaks immediately instead of looping to
                    // MAX_CONTAINERS_TO_SCAN.
                    if (getDiscussionsCallCount === 0) {
                        getDiscussionsCallCount++;
                        return [CONTAINER];
                    }
                    return [];
                }
                if (method === 'get_content_replies') {
                    return REPLIES;
                }
                return [];
            }),
        },
    },
}));

let getDiscussionsCallCount = 0;

const mutedListMock = vi.fn(async (username?: string) => {
    if (username === 'meno') return new Set(['personallymutedauthor']);
    return new Set<string>(); // no community-wide mutes for this fixture
});

vi.mock('@/lib/hive/muted-accounts', () => ({
    mutedAccountsManager: {
        getMutedList: (username?: string) => mutedListMock(username),
    },
}));

beforeEach(() => {
    // Fixed "now" close enough to the fixture's created date that it falls
    // inside the 15min-48h discovery window (see REPLIES above).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T10:00:00.000Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('fetchTrendingSnapCandidates personal-mute filtering', () => {
    it('includes every non-community-muted author when no username is given', async () => {
        const { fetchTrendingSnapCandidates } = await import('./snapTrending');
        const { items } = await fetchTrendingSnapCandidates(10, 0);
        const authors = items.map(i => i.author);
        expect(authors).toContain('goodauthor');
        expect(authors).toContain('personallymutedauthor');
    });

    it('excludes an author the requesting viewer has personally muted', async () => {
        const { fetchTrendingSnapCandidates } = await import('./snapTrending');
        const { items } = await fetchTrendingSnapCandidates(10, 0, 'meno');
        const authors = items.map(i => i.author);
        expect(authors).toContain('goodauthor');
        expect(authors).not.toContain('personallymutedauthor');
    });
});
