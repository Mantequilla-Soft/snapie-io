import { ExtendedComment } from '@/hooks/useComments';
import { getRawSnapPool, computeVelocityScore, isWithinDiscoveryWindow, isSnapieCommunityPost, rankForYouCandidates } from './snapTrending';
import { fetchSidecarFeed, SidecarFeedItem } from './sidecarClient';
import { matchTagsToCategories } from './tagKeywordMatch';
import { fetchResurrectionCandidates } from './contentResurrection';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

// A resurrected item doesn't need to match the requester's interest tags —
// same relaxation as the community-content backfill below (neither is
// "personalized," both are "genuinely worth seeing anyway"). Capped small;
// this is a sprinkle, not a pool.
const RESURRECTION_SPRINKLE_LIMIT = 2;

// No longer Combflow-bound (see tagKeywordMatch.ts for why) — this TTL is
// just "how fresh does the ranked pool need to be," same reasoning as
// snapTrending.ts's Trending pool, just a bit longer since this pool is
// slightly more expensive to build (two source fetches instead of one).
const CACHE_TTL_MS = 5 * 60 * 1000;
// Caps the final ranked pool size, same scale as Trending's RANKED_POOL_SIZE
// — bounds memory/pagination depth, not an external-call cost concern.
const WARM_POOL_SIZE = 50;
// The sidecar caps /feed at 50 per request (see internal-docs/hive-activity-sidecar-feed.md).
const SIDECAR_FETCH_LIMIT = 50;

function toExtendedComment(item: SidecarFeedItem): ExtendedComment {
    return {
        ...item,
        parent_author: item.parentAuthor,
        parent_permlink: item.parentPermlink,
    } as unknown as ExtendedComment;
}

async function fetchWavePool(): Promise<ExtendedComment[]> {
    const { items } = await fetchSidecarFeed({ limit: SIDECAR_FETCH_LIMIT });
    return items.filter(item => item.source === 'wave').map(toExtendedComment);
}

function tagsCacheKey(tags: string[]): string {
    return [...tags].sort().join(',');
}

/** Pure core: windows candidates to the same recency bound as Trending
 *  (see isWithinDiscoveryWindow — without this, an old post that racked up
 *  a lot of replies over days can outscore anything fresh indefinitely,
 *  since nothing ever evicts it; the warm pool went stale exactly this way
 *  before this filter existed, confirmed live: items up to 8+ days old
 *  ranked above 5-hour-old ones), then velocity-ranks, then filters to
 *  those whose own hashtags (json_metadata.tags) match the requested
 *  interest tags — see tagKeywordMatch.ts for why this is hashtag-based
 *  rather than Combflow-based (Combflow doesn't classify snaps/waves at
 *  all, confirmed directly). No I/O — takes items that already carry their
 *  own json_metadata, so this is unit-testable without network/Mongo.
 *  Deliberately simple for v1 (filter-then-sort-by-engagement, not a
 *  weighted match-strength blend) — a documented simplification, not a
 *  hidden gap. */
export function filterAndRankByCategory(
    items: ExtendedComment[],
    tags: string[],
    now: number = Date.now(),
): ExtendedComment[] {
    const tagSet = new Set(tags);
    return items
        .filter(item => isWithinDiscoveryWindow(item.created, now))
        .map(item => ({ item, score: computeVelocityScore(item.children ?? 0, item.created, now) }))
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item)
        .filter(item => matchTagsToCategories(item.json_metadata).some(c => tagSet.has(c)))
        .slice(0, WARM_POOL_SIZE)
        .map(item => ({
            ...item,
            isDiscovery: true,
            discoveryReason: 'category-match' as const,
        }));
}

/** Hashtag matching only catches posts that happened to self-tag with
 *  something recognizable (see filterAndRankByCategory above) — for a lot of
 *  real interest-tag combinations that's a genuinely small number, and it
 *  shrinks further now that the pool is correctly windowed to 48h (see
 *  isWithinDiscoveryWindow). Rather than let pagination just run dry, fill
 *  the remainder with the same community-scoped, engagement-ranked content
 *  the cold-start "For You" state already shows — the exact same fallback
 *  the cold state already applies for "zero interests picked," just
 *  triggered by "too few interest matches" instead. `exclude` keeps an
 *  already-matched post from also appearing as a fallback duplicate. */
export function backfillWithCommunityContent(
    pool: ExtendedComment[],
    exclude: Set<string>,
    limit: number,
    now: number,
): ExtendedComment[] {
    if (limit <= 0) return [];
    const candidates = pool.filter(
        item => isSnapieCommunityPost(item) && !exclude.has(`${item.author}/${item.permlink}`),
    );
    return rankForYouCandidates(candidates, limit, new Set(), now).map(item => ({
        ...item,
        isDiscovery: true,
        discoveryReason: 'community-fallback' as const,
    }));
}

/** Builds the warm-state candidate pool for one interest-tag combination.
 *  Deliberately does NOT apply personal mutes here — this pool is cached and
 *  shared across every user who happens to share the same tag combination
 *  (see fetchWarmForYouCandidates), so baking in one requester's personal
 *  mute list would leak into every other user's results. Only community-wide
 *  mutes (mutedAccountsManager.getMutedList() with no username, same call
 *  shape the Trending pool already uses) are safe to bake in here; personal
 *  mutes are applied per-request, after the cache lookup, below. */
async function buildWarmPool(tags: string[]): Promise<ExtendedComment[]> {
    const now = Date.now();
    const [snapPool, wavePool, communityMuted, resurrected] = await Promise.all([
        getRawSnapPool(),
        fetchWavePool(),
        mutedAccountsManager.getMutedList(),
        fetchResurrectionCandidates(),
    ]);

    const combined = [...snapPool, ...wavePool].filter(item => !communityMuted.has(item.author.toLowerCase()));
    const matched = filterAndRankByCategory(combined, tags, now);

    // Priority order: real interest matches, then a small resurrection
    // sprinkle, then generic community backfill only if there's still room
    // — a resurrected item is more interesting than generic backfill, so it
    // goes ahead of it, not behind it.
    const matchedKeys = new Set(matched.map(item => `${item.author}/${item.permlink}`));
    const resurrectedSprinkle = resurrected
        .filter(item => !matchedKeys.has(`${item.author}/${item.permlink}`) && !communityMuted.has(item.author.toLowerCase()))
        .slice(0, RESURRECTION_SPRINKLE_LIMIT);
    resurrectedSprinkle.forEach(item => matchedKeys.add(`${item.author}/${item.permlink}`));

    const withResurrection = [...matched, ...resurrectedSprinkle];
    if (withResurrection.length >= WARM_POOL_SIZE) return withResurrection;

    const fallback = backfillWithCommunityContent(combined, matchedKeys, WARM_POOL_SIZE - withResurrection.length, now);
    return [...withResurrection, ...fallback];
}

interface CacheEntry {
    expiresAt: number;
    promise: Promise<ExtendedComment[]>;
}

// Keyed by the sorted tag combination — most users share one of a small
// number of combinations given a fixed topic vocabulary, so this scales at
// ~1000 WAU without a background scheduler. Rebuilds lazily on the next
// request past expiry, same pattern as snapTrending.ts's single-slot cache.
const cache = new Map<string, CacheEntry>();

/** Cross-community, snaps+waves candidate pool ranked by interest-tag match
 *  + engagement, for the warm-state "For You" feed. `username`, if provided,
 *  is used only to apply that requester's personal mutes on top of the
 *  shared cached pool — never baked into the cache itself (see buildWarmPool). */
export async function fetchWarmForYouCandidates(
    tags: string[],
    limit: number,
    offset: number = 0,
    username?: string,
): Promise<{ items: ExtendedComment[]; hasMore: boolean }> {
    const key = tagsCacheKey(tags);
    const now = Date.now();
    const existing = cache.get(key);
    if (!existing || existing.expiresAt < now) {
        cache.set(key, { expiresAt: now + CACHE_TTL_MS, promise: buildWarmPool(tags) });
    }

    let pool = await cache.get(key)!.promise;

    if (username) {
        const personalMuted = await mutedAccountsManager.getMutedList(username);
        pool = pool.filter(item => !personalMuted.has(item.author.toLowerCase()));
    }

    return {
        items: pool.slice(offset, offset + limit),
        hasMore: offset + limit < pool.length,
    };
}
