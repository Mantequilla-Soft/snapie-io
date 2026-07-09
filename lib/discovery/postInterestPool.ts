import { Discussion } from '@hiveio/dhive';
import HiveClient from '@/lib/hive/hiveclient';
import { getOrFetchPostCategories } from './postCategoryCache';
import { computeVelocityScore } from './snapTrending';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

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
        });
}

function tagsCacheKey(tags: string[]): string {
    return [...tags].sort().join(',');
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
    const SCAFFOLD_AUTHORS = new Set(['peak.snaps', 'ecency.waves']);
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

    return filterAndRankPosts(candidates, tags, categoryMap);
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
