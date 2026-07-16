import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolated mock per test file (vitest's default fresh module registry) — same
// pattern as lib/discovery/snapTrending.mutes.test.ts. get_content/
// get_reblogged_by responses are driven by these two mutable maps, keyed by
// `${author}/${permlink}`, reset in beforeEach.

const contentByKey = new Map<string, any>();
const rebloggedByKey = new Map<string, string[]>();
const callLog: { method: string; params: unknown[] }[] = [];

vi.mock('@/lib/hive/hiveclient', () => ({
    default: {
        database: {
            call: vi.fn(async (method: string, params: unknown[]) => {
                callLog.push({ method, params });
                if (method === 'get_content') {
                    const [author, permlink] = params as [string, string];
                    return contentByKey.get(`${author}/${permlink}`) ?? { author: '' };
                }
                if (method === 'get_reblogged_by') {
                    const [author, permlink] = params as [string, string];
                    return rebloggedByKey.get(`${author}/${permlink}`) ?? [];
                }
                return null;
            }),
        },
    },
}));

function setContent(author: string, permlink: string, overrides: Partial<{
    author: string; depth: number; parent_author: string; json_metadata: string;
    active_votes: { voter: string }[];
}> = {}) {
    contentByKey.set(`${author}/${permlink}`, {
        author,
        permlink,
        depth: 0,
        parent_author: '',
        json_metadata: JSON.stringify({ app: 'snapie.io' }),
        ...overrides,
    });
}

beforeEach(() => {
    contentByKey.clear();
    rebloggedByKey.clear();
    callLog.length = 0;
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

// verifyAction's retry loop uses real setTimeout under fake timers — advancing
// past the full ~6s retry window lets an "eventually gives up" case resolve
// without the test actually waiting in real time.
async function runWithRetries<T>(promise: Promise<T>): Promise<T> {
    const advance = vi.advanceTimersByTimeAsync(10_000);
    const [result] = await Promise.all([promise, advance]);
    return result;
}

describe('verifyAction — content actions (blog/snap/comment)', () => {
    it('verifies a blog post: own author, top-level, Snapie app tag', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('alice', 'my-post', { depth: 0 });
        const result = await verifyAction('blog', 'alice', 'alice', 'my-post');
        expect(result).toBe('ok');
    });

    it('rejects a blog credited to someone else', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('bob', 'my-post', { depth: 0 });
        const result = await runWithRetries(verifyAction('blog', 'alice', 'bob', 'my-post'));
        expect(result).toBe('unverified');
    });

    it('rejects a post not tagged as a Snapie app', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('alice', 'my-post', { depth: 0, json_metadata: JSON.stringify({ app: 'peakd/2024.1' }) });
        const result = await runWithRetries(verifyAction('blog', 'alice', 'alice', 'my-post'));
        expect(result).toBe('unverified');
    });

    it('accepts snapie-mobile as a Snapie app (startsWith match)', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('alice', 'my-snap', { depth: 1, json_metadata: JSON.stringify({ app: 'snapie-mobile/1.0' }) });
        const result = await verifyAction('snap', 'alice', 'alice', 'my-snap');
        expect(result).toBe('ok');
    });

    it('rejects a blog claim on a comment (depth > 0)', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('alice', 'a-reply', { depth: 1 });
        const result = await runWithRetries(verifyAction('blog', 'alice', 'alice', 'a-reply'));
        expect(result).toBe('unverified');
    });

    it('verifies a snap/comment (depth > 0, own author, app tag)', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('alice', 'a-reply', { depth: 2 });
        expect(await verifyAction('comment', 'alice', 'alice', 'a-reply')).toBe('ok');
    });

    it('does not award commenting on your own post', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('alice', 'a-reply', { depth: 1, parent_author: 'alice' });
        const result = await verifyAction('comment', 'alice', 'alice', 'a-reply');
        expect(result).toBe('self');
    });

    it('is case-insensitive when matching authorship', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('Alice', 'my-post', { depth: 0 });
        const result = await verifyAction('blog', 'alice', 'Alice', 'my-post');
        expect(result).toBe('ok');
    });

    it('retries on a not-yet-propagated post, then succeeds once it appears', async () => {
        const { verifyAction } = await import('./hiveVerify');
        // Nothing in contentByKey yet — get_content returns the "not found" stub
        // on the first attempt. Populate it before the retry window elapses.
        const promise = verifyAction('blog', 'alice', 'alice', 'lagging-post');
        // Let the first (zero-delay) attempt run and see "not found", then
        // populate before the second attempt fires.
        await vi.advanceTimersByTimeAsync(0);
        setContent('alice', 'lagging-post', { depth: 0 });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(await promise).toBe('ok');
    });

    it('gives up as unverified if the post never appears', async () => {
        const { verifyAction } = await import('./hiveVerify');
        const result = await runWithRetries(verifyAction('blog', 'alice', 'alice', 'ghost-post'));
        expect(result).toBe('unverified');
    });
});

describe('verifyAction — vote', () => {
    it('verifies the user is in active_votes', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('bob', 'a-post', { active_votes: [{ voter: 'alice' }] });
        expect(await verifyAction('vote', 'alice', 'bob', 'a-post')).toBe('ok');
    });

    it('rejects self-votes without any network call', async () => {
        const { verifyAction } = await import('./hiveVerify');
        const result = await verifyAction('vote', 'alice', 'alice', 'a-post');
        expect(result).toBe('self');
        expect(callLog.length).toBe(0);
    });

    it('is unverified if the vote never shows up', async () => {
        const { verifyAction } = await import('./hiveVerify');
        setContent('bob', 'a-post', { active_votes: [{ voter: 'someoneelse' }] });
        const result = await runWithRetries(verifyAction('vote', 'alice', 'bob', 'a-post'));
        expect(result).toBe('unverified');
    });
});

describe('verifyAction — reblog', () => {
    it('verifies the user appears in get_reblogged_by', async () => {
        const { verifyAction } = await import('./hiveVerify');
        rebloggedByKey.set('bob/a-post', ['someoneelse', 'alice']);
        expect(await verifyAction('reblog', 'alice', 'bob', 'a-post')).toBe('ok');
    });

    it('rejects self-reblogs without any network call', async () => {
        const { verifyAction } = await import('./hiveVerify');
        const result = await verifyAction('reblog', 'alice', 'alice', 'a-post');
        expect(result).toBe('self');
        expect(callLog.length).toBe(0);
    });

    it('is unverified if the reblog never shows up', async () => {
        const { verifyAction } = await import('./hiveVerify');
        rebloggedByKey.set('bob/a-post', ['someoneelse']);
        const result = await runWithRetries(verifyAction('reblog', 'alice', 'bob', 'a-post'));
        expect(result).toBe('unverified');
    });
});
