import HiveClient from '@/lib/hive/hiveclient';
import { ExtendedComment } from '@/hooks/useComments';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

// Phase 1 stays close to "currently active but under-surfaced" — true
// resurrection of old, dormant content is a Phase 2+ concept that needs its
// own rate-vs-baseline machinery, not this simple recency-windowed score.
const MIN_AGE_MINUTES = 15;
const MAX_AGE_HOURS = 48;
// Floor on the age used in the score denominator, so a snap posted moments
// ago with a single reply doesn't produce an absurd score from dividing by
// a near-zero number of hours.
const MIN_SCORE_AGE_HOURS = 0.25;

// Hive timestamps omit the trailing 'Z' — parsed as-is, `new Date()` reads
// them as local time instead of UTC. On a server running outside UTC (this
// one runs UTC-5) every age in this file was coming out ~5 hours short of
// the truth, letting posts up to ~53h old slide past the intended 48h
// cutoff. Same normalization already used in lib/utils/GetPostDate.ts and
// getPayoutValue — one shared helper here since two functions need it.
function parseHiveTimestamp(createdAt: string): number {
    const normalized = !createdAt.endsWith('Z') ? `${createdAt}Z` : createdAt;
    return new Date(normalized).getTime();
}

export function computeVelocityScore(children: number, createdAt: string, now: number = Date.now()): number {
    const ageHours = Math.max((now - parseHiveTimestamp(createdAt)) / (1000 * 60 * 60), MIN_SCORE_AGE_HOURS);
    return children / ageHours;
}

/**
 * Shared recency window for every "discovery" pool (Trending, cold-start For
 * You, warm For You) — too young and its velocity score is noise (a single
 * reply on a 2-minute-old post looks huge); too old and it's not "currently
 * active," it's just accumulated history. Exported so every ranker applies
 * the identical cutoff instead of each one deciding for itself whether "old"
 * means something.
 */
export function isWithinDiscoveryWindow(createdAt: string, now: number = Date.now()): boolean {
    const ageMs = now - parseHiveTimestamp(createdAt);
    const ageMinutes = ageMs / (1000 * 60);
    const ageHours = ageMs / (1000 * 60 * 60);
    return ageMinutes >= MIN_AGE_MINUTES && ageHours <= MAX_AGE_HOURS;
}

/**
 * Ranks candidates by comment velocity instead of payout. Filters out
 * candidates authored by a muted/community-muted account — cheap, since the
 * author field is already on every fetched item, no extra fetch required.
 * Does NOT (yet) detect a single account spam-replying to inflate `children`
 * on its own snap — that needs each candidate's own reply list, which is a
 * per-candidate fetch this phase deliberately avoids. Real trust-weighting
 * is a Phase 4 concern; this is a known, accepted gap until then.
 */
function scoreAndWindowCandidates(
    items: ExtendedComment[],
    limit: number,
    mutedAuthors: Set<string>,
    now: number,
): ExtendedComment[] {
    return items
        .filter(item => !mutedAuthors.has(item.author.toLowerCase()))
        .filter(item => isWithinDiscoveryWindow(item.created, now))
        .map(item => ({ item, score: computeVelocityScore(item.children, item.created, now) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ item }) => item);
}

export function rankSnapCandidates(
    items: ExtendedComment[],
    limit: number,
    mutedAuthors: Set<string>,
    now: number = Date.now(),
): ExtendedComment[] {
    return scoreAndWindowCandidates(items, limit, mutedAuthors, now).map(item => ({
        ...item,
        isDiscovery: true,
        discoveryReason: 'trending',
    }));
}

/**
 * Same velocity ranking as rankSnapCandidates, but without the
 * isDiscovery/discoveryReason tag — used for the cold-start "For You" feed,
 * which shouldn't render every item with a "Trending" badge the way the
 * dedicated Trending tab does.
 */
export function rankForYouCandidates(
    items: ExtendedComment[],
    limit: number,
    mutedAuthors: Set<string>,
    now: number = Date.now(),
): ExtendedComment[] {
    return scoreAndWindowCandidates(items, limit, mutedAuthors, now);
}

interface CacheEntry<T> {
    expiresAt: number;
    promise: Promise<T>;
}

// Module-level caches shared by every request in this process — one Hive walk
// serves every visitor for the TTL window instead of one walk per request.
// Reset on every deploy (pm2 restart clears module state); that's fine, it
// just recomputes on the next request.
const CACHE_TTL_MS = 2 * 60 * 1000;
let rawPoolCache: CacheEntry<ExtendedComment[]> | null = null;
let rankedCache: CacheEntry<ExtendedComment[]> | null = null;
let forYouCache: CacheEntry<ExtendedComment[]> | null = null;

const CONTAINER_AUTHOR = 'peak.snaps';
// 10 containers is enough to build a pool deep enough for a dedicated
// Trending tab to paginate through (see RANKED_POOL_SIZE below), while still
// bounding a cold-cache fetch to a reasonable number of sequential Hive
// round-trips.
const MAX_CONTAINERS_TO_SCAN = 10;
const CONTAINER_FETCH_LIMIT = 3;
const RANKED_POOL_SIZE = 50;

const COMMUNITY_TAG = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || '';

/** Exported for the cosmetic "Snapie community" badge (see
 *  components/homepage/Snap.tsx) — same check used internally here to scope
 *  the cold-start pool, exposed as a reusable predicate since the badge
 *  needs to apply regardless of which "For You" state (cold/warm) a post
 *  came through. Source-agnostic: works the same for snap and wave items,
 *  since both carry json_metadata.tags the same way. */
export function isSnapieCommunityPost(item: ExtendedComment): boolean {
    if (!item.json_metadata) return false;
    try {
        const metadata = JSON.parse(item.json_metadata);
        const tags = metadata.tags || [];
        return tags.includes(COMMUNITY_TAG);
    } catch {
        return false;
    }
}

/** Unranked, unfiltered walk of the peak.snaps container replies — the raw
 *  material both the Trending pool and the For You pool score/filter from.
 *  Cached independently of the ranked pools below so callers that need
 *  different rankings over the same underlying data (Trending vs. For You)
 *  don't each pay for their own Hive walk. */
async function fetchRawSnapPool(): Promise<ExtendedComment[]> {
    const allReplies: ExtendedComment[] = [];
    let permlink = '';
    let date = new Date().toISOString();
    let containersScanned = 0;

    while (containersScanned < MAX_CONTAINERS_TO_SCAN) {
        const containers = await HiveClient.database.call('get_discussions_by_author_before_date', [
            CONTAINER_AUTHOR,
            permlink,
            date,
            CONTAINER_FETCH_LIMIT,
        ]);

        if (!containers.length) break;
        containersScanned += containers.length;

        const repliesPerContainer = await Promise.all(
            containers.map((container: any) =>
                HiveClient.database.call('get_content_replies', [CONTAINER_AUTHOR, container.permlink]),
            ),
        );

        for (let i = 0; i < containers.length; i++) {
            allReplies.push(...(repliesPerContainer[i] as ExtendedComment[]));
            permlink = containers[i].permlink;
            date = containers[i].created;
        }
    }

    return allReplies;
}

/** Cached raw (unranked, unfiltered) snap pool — exported so the warm
 *  "For You" pool builder (lib/discovery/forYouWarm.ts) can reuse the same
 *  cached Hive walk instead of paying for its own, when it wants the
 *  unrestricted (no community-tag filter) version of this same data. */
export function getRawSnapPool(): Promise<ExtendedComment[]> {
    const now = Date.now();
    if (!rawPoolCache || rawPoolCache.expiresAt < now) {
        rawPoolCache = { expiresAt: now + CACHE_TTL_MS, promise: fetchRawSnapPool() };
    }
    return rawPoolCache.promise;
}

async function fetchRankedTrendingPool(): Promise<ExtendedComment[]> {
    const [pool, mutedList] = await Promise.all([getRawSnapPool(), mutedAccountsManager.getMutedList()]);
    return rankSnapCandidates(pool, RANKED_POOL_SIZE, mutedList);
}

async function fetchRankedForYouPool(): Promise<ExtendedComment[]> {
    const [pool, mutedList] = await Promise.all([getRawSnapPool(), mutedAccountsManager.getMutedList()]);
    const communityOnly = pool.filter(isSnapieCommunityPost);
    return rankForYouCandidates(communityOnly, RANKED_POOL_SIZE, mutedList);
}

/** Cached, ranked pool of trending-snap candidates. `limit`/`offset` only
 *  slice the already-ranked cached pool — they don't change how much of Hive
 *  gets scanned. Used both for the feed-interleave (small limit, offset 0)
 *  and the dedicated Trending tab (paginating via offset). */
export async function fetchTrendingSnapCandidates(limit: number, offset: number = 0): Promise<{ items: ExtendedComment[]; hasMore: boolean }> {
    const now = Date.now();
    if (!rankedCache || rankedCache.expiresAt < now) {
        rankedCache = { expiresAt: now + CACHE_TTL_MS, promise: fetchRankedTrendingPool() };
    }
    const pool = await rankedCache.promise;
    return {
        items: pool.slice(offset, offset + limit),
        hasMore: offset + limit < pool.length,
    };
}

/** Same cached raw Hive walk as fetchTrendingSnapCandidates, but filtered to
 *  Snapie-community-tagged posts only and ranked without the trending tag —
 *  this is the cold-start "For You" pool: community-scoped, engagement
 *  ordered instead of chronological. */
export async function fetchForYouSnapCandidates(limit: number, offset: number = 0): Promise<{ items: ExtendedComment[]; hasMore: boolean }> {
    const now = Date.now();
    if (!forYouCache || forYouCache.expiresAt < now) {
        forYouCache = { expiresAt: now + CACHE_TTL_MS, promise: fetchRankedForYouPool() };
    }
    const pool = await forYouCache.promise;
    return {
        items: pool.slice(offset, offset + limit),
        hasMore: offset + limit < pool.length,
    };
}
