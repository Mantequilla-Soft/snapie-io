import { Discussion } from '@hiveio/dhive';
import HiveClient from '@/lib/hive/hiveclient';
import { getOrFetchPostCategories } from './postCategoryCache';
import { computeVelocityScore } from './snapTrending';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { buildTopicSearchQuery } from './tagKeywordMatch';

export type PostDiscoveryReason = 'category-match' | 'topic-search';

// One Hive walk serves every visitor for this window — same reasoning as
// snapTrending.ts's raw pool cache, just a plain single-slot cache since the
// raw pool here (unlike snaps) doesn't need per-mode filtering upstream.
const RAW_POOL_CACHE_TTL_MS = 2 * 60 * 1000;
// Combflow-bound (via getOrFetchPostCategories), so longer than the raw
// pool's TTL — same reasoning as forYouWarm.ts's ranked-pool cache.
const RANKED_POOL_CACHE_TTL_MS = 5 * 60 * 1000;

// bridge.get_ranked_posts caps `limit` at 20 (confirmed directly against a
// live node) — two sequential calls build a small, fixed-size raw pool.
// Unlike the snap pool (2000+ items), this is small enough that no
// pre-rank-then-cap step is needed before the Combflow lookup.
const POSTS_PER_CALL = 20;

// Same scale as forYouWarm.ts's WARM_POOL_SIZE — bounds pagination depth,
// not a cost concern. The live/recent pool above rarely gets close to this
// on its own (see fetchTopicSearchMatches below for why).
const TARGET_POOL_SIZE = 50;

// Genuine top-level posts only, never the daily snap/wave container
// scaffolding (authored by peak.snaps/ecency.waves) — empty shells with no
// real content to personalize around. Shared between the live pool
// (buildPostPool) and the topic-search backfill (fetchTopicSearchMatches).
const SCAFFOLD_AUTHORS = new Set(['peak.snaps', 'ecency.waves']);

const HIVESENSE_SEARCH_URL = 'https://api.hive.blog/hivesense-api/posts/search';

interface RawCacheEntry {
    expiresAt: number;
    promise: Promise<Discussion[]>;
}
let rawPoolCache: RawCacheEntry | null = null;

// bridge.get_ranked_posts directly via the isomorphic HiveClient
// (lib/hive/hiveclient.tsx) — NOT lib/hive/client-functions.ts's findPosts,
// which has 'use client' at the top and transitively imports Aioha
// (wallet-connection code). Next.js's server bundler replaces that module's
// exports with non-callable client-reference stand-ins when imported from
// an API route — confirmed directly ("TypeError: findPosts is not a
// function"), not a hypothetical concern.
async function fetchRankedPostsPage(params: { limit: number; start_author?: string; start_permlink?: string }): Promise<Discussion[]> {
    return HiveClient.call('bridge', 'get_ranked_posts', {
        sort: 'created',
        tag: '',
        observer: '',
        limit: params.limit,
        start_author: params.start_author || '',
        start_permlink: params.start_permlink || '',
    });
}

async function fetchRawPostPool(): Promise<Discussion[]> {
    const batch1: Discussion[] = await fetchRankedPostsPage({ limit: POSTS_PER_CALL });
    const last = batch1[batch1.length - 1];
    const batch2: Discussion[] = last
        ? await fetchRankedPostsPage({ limit: POSTS_PER_CALL, start_author: last.author, start_permlink: last.permlink })
        : [];

    const seen = new Set<string>();
    const combined: Discussion[] = [];
    for (const post of [...batch1, ...batch2]) {
        const key = `${post.author}/${post.permlink}`;
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push(post);
    }
    return combined;
}

function getRawPostPool(): Promise<Discussion[]> {
    const now = Date.now();
    if (!rawPoolCache || rawPoolCache.expiresAt < now) {
        rawPoolCache = { expiresAt: now + RAW_POOL_CACHE_TTL_MS, promise: fetchRawPostPool() };
    }
    return rawPoolCache.promise;
}

/** Pure core: velocity-ranks candidates, then filters to those whose
 *  Combflow categories (from the already-fetched categoryMap,
 *  author/permlink -> category slugs) intersect the requested interest
 *  tags. No I/O — unit-testable without network/Mongo. Unlike
 *  forYouWarm.ts's equivalent, no hashtag fallback is needed — Combflow
 *  classifies genuine top-level posts well (confirmed: 39/40 hit rate). */
export function filterAndRankPosts(
    posts: Discussion[],
    tags: string[],
    categoryMap: Map<string, string[]>,
    now: number = Date.now(),
): Discussion[] {
    const tagSet = new Set(tags);
    return posts
        .map(post => ({ post, score: computeVelocityScore(post.children ?? 0, post.created, now) }))
        .sort((a, b) => b.score - a.score)
        .map(({ post }) => post)
        .filter(post => {
            const categories = categoryMap.get(`${post.author}/${post.permlink}`) ?? [];
            return categories.some(c => tagSet.has(c));
        })
        .map(post => ({ ...post, discoveryReason: 'category-match' as const }));
}

function tagsCacheKey(tags: string[]): string {
    return [...tags].sort().join(',');
}

/** Combflow classification only covers the ~40 most recent posts site-wide
 *  (see getRawPostPool) — a genuinely tiny pool before it's even filtered
 *  by tag match, so most interest-tag combinations end up with a handful of
 *  matches at best (confirmed live: several combinations returned exactly
 *  one post, no pagination). hivesense-api's search endpoint searches all
 *  of Hive's indexed history instead of just the last 40 posts, but it
 *  ranks by relevance, not recency — confirmed live, queries for several
 *  categories returned nothing newer than a few years old. So this is a
 *  backfill, not a replacement: the live/recent pool leads (it's what's
 *  actually current), search only fills the remainder once that runs out,
 *  same shape as forYouWarm.ts's community-content backfill but staying
 *  on-topic instead of falling back to "anything recent." One combined
 *  query across every requested tag (buildTopicSearchQuery) rather than one
 *  call per tag — this hits a shared public Hive node, not our own
 *  infrastructure. */
async function fetchTopicSearchMatches(
    tags: string[],
    limit: number,
    communityMuted: Set<string>,
): Promise<Discussion[]> {
    if (limit <= 0) return [];
    const query = buildTopicSearchQuery(tags);
    if (!query) return [];

    const url = new URL(HIVESENSE_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('truncate', '0');
    url.searchParams.set('result_limit', String(limit));
    // Only the first `full_posts` results come back fully hydrated
    // (author/created/etc.) — anything beyond that is a bare stub.
    // Matching it to result_limit means every result we ask for is usable.
    url.searchParams.set('full_posts', String(limit));
    url.searchParams.set('observer', process.env.NEXT_PUBLIC_HIVE_USER || 'snapie');

    try {
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return filterTopicSearchResults(data, communityMuted);
    } catch {
        return [];
    }
}

/** Pure core of fetchTopicSearchMatches — no I/O, unit-testable directly.
 *  hivesense-api doesn't expose parent_author on search results the way
 *  bridge.get_ranked_posts does, so `depth === 0` is the top-level check
 *  here instead. Also drops anything past the request's `full_posts` count
 *  (hivesense only fully hydrates that many results; the rest come back as
 *  bare stubs missing author/permlink/created — unusable, not "matches
 *  nothing"). */
export function filterTopicSearchResults(
    results: Array<Discussion & { depth?: number }>,
    communityMuted: Set<string>,
): Discussion[] {
    return results.filter(post =>
        post?.depth === 0 &&
        post?.author && post?.permlink && post?.created &&
        !SCAFFOLD_AUTHORS.has(post.author) &&
        !communityMuted.has(post.author.toLowerCase()),
    );
}

/** Builds the interest-matched pool for one tag combination. Deliberately
 *  does NOT apply personal mutes here — shared/cached across every user who
 *  happens to request the same tag combination (see
 *  fetchPostInterestCandidates below), so baking in one requester's
 *  personal mutes would leak into every other user's results. Only
 *  community-wide mutes are safe to bake in; personal mutes are applied
 *  per-request, after the cache lookup. */
async function buildPostPool(tags: string[]): Promise<Discussion[]> {
    const [rawPool, communityMuted] = await Promise.all([
        getRawPostPool(),
        mutedAccountsManager.getMutedList(),
    ]);

    // get_ranked_posts should already only return top-level content, but
    // the existing Blog page itself defensively re-checks this
    // (app/blog/page.tsx's !post.parent_author filter) — mirrored here for
    // the same reason. Also excludes the daily snap/wave container-scaffold
    // posts themselves (authored by peak.snaps/ecency.waves) — these are
    // genuine top-level posts, so they pass every other check, but they're
    // empty scaffolding ("Snaps Container // ...") with no real content to
    // personalize around, confirmed showing up in a live test.
    const candidates = rawPool.filter(post =>
        !post.parent_author &&
        !SCAFFOLD_AUTHORS.has(post.author) &&
        !communityMuted.has(post.author.toLowerCase()),
    );

    const categoryResults = await getOrFetchPostCategories(
        candidates.map(post => ({ author: post.author, permlink: post.permlink })),
    );
    const categoryMap = new Map<string, string[]>();
    categoryResults.forEach((result, key) => categoryMap.set(key, result.categories));

    const matched = filterAndRankPosts(candidates, tags, categoryMap);
    if (matched.length >= TARGET_POOL_SIZE) return matched;

    const matchedKeys = new Set(matched.map(post => `${post.author}/${post.permlink}`));
    const searchResults = await fetchTopicSearchMatches(tags, TARGET_POOL_SIZE - matched.length + matchedKeys.size, communityMuted);

    const fallback: (Discussion & { discoveryReason?: PostDiscoveryReason })[] = [];
    for (const post of searchResults) {
        const key = `${post.author}/${post.permlink}`;
        if (matchedKeys.has(key)) continue;
        matchedKeys.add(key);
        fallback.push({ ...post, discoveryReason: 'topic-search' as const });
        if (fallback.length >= TARGET_POOL_SIZE - matched.length) break;
    }

    return [...matched, ...fallback];
}

interface RankedCacheEntry {
    expiresAt: number;
    promise: Promise<Discussion[]>;
}

// Keyed by the sorted tag combination — same reasoning as forYouWarm.ts's
// cache: most users share one of a small number of combinations given a
// fixed topic vocabulary.
const rankedCache = new Map<string, RankedCacheEntry>();

/** Cross-community, genuine-post candidate pool ranked by interest-tag
 *  match + engagement, for the Blog "For You" tab. `username`, if provided,
 *  is used only to apply that requester's personal mutes on top of the
 *  shared cached pool — never baked into the cache itself (see
 *  buildPostPool). */
export async function fetchPostInterestCandidates(
    tags: string[],
    limit: number,
    offset: number = 0,
    username?: string,
): Promise<{ items: Discussion[]; hasMore: boolean }> {
    const key = tagsCacheKey(tags);
    const now = Date.now();
    const existing = rankedCache.get(key);
    if (!existing || existing.expiresAt < now) {
        rankedCache.set(key, { expiresAt: now + RANKED_POOL_CACHE_TTL_MS, promise: buildPostPool(tags) });
    }

    let pool = await rankedCache.get(key)!.promise;

    if (username) {
        const personalMuted = await mutedAccountsManager.getMutedList(username);
        pool = pool.filter(post => !personalMuted.has(post.author.toLowerCase()));
    }

    return {
        items: pool.slice(offset, offset + limit),
        hasMore: offset + limit < pool.length,
    };
}
