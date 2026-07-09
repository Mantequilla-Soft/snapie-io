import { ExtendedComment } from '@/hooks/useComments';
import HiveClient from '@/lib/hive/hiveclient';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { CONTAINER_AUTHOR, MAX_AGE_HOURS, parseHiveTimestamp } from './snapTrending';

// How far back "dormant" reaches — confirmed with the user: enough to catch
// content that goes viral a year after it was posted (their own example),
// without an unbounded historical scan.
const RESURRECTION_MAX_AGE_DAYS = 365;

// What counts as "just caught fire" — replies landing inside this trailing
// window, compared against the post's own reply rate *before* this window
// (see computeBurstScore). 24h, not tighter, so a burst spread across a
// slow news day still registers.
const BURST_WINDOW_HOURS = 24;

// Absolute floor on replies inside the burst window — without this, a
// single reply on a post with zero prior replies would trivially pass the
// multiplier check below (any rate > 0 is "infinitely" bigger than a 0
// baseline). Three real replies is a much safer bar for "this caught fire."
const MIN_BURST_REPLIES = 3;

// How much faster the recent rate must be than the post's own pre-burst
// baseline. Confirmed with the user as a reasonable starting point — easy
// to retune later without touching the rest of the pipeline.
const BURST_MULTIPLIER = 3;

// Floor on the age used in rate denominators, mirrors snapTrending.ts's own
// MIN_SCORE_AGE_HOURS — avoids an absurd rate from dividing by ~0.
const MIN_RATE_AGE_HOURS = 0.25;

// Cheap pre-filter before the expensive per-candidate reply-timestamp fetch
// — a post with almost no lifetime engagement is extremely unlikely to be
// mid-burst, not worth the extra Hive round-trip to check.
const MIN_CHILDREN_FOR_BURST_CHECK = 3;

// Caps how many qualifying candidates a single cycle keeps — this is meant
// to be a rare, delightful sprinkle across Trending/For You, not a pool of
// its own size.
const RESURRECTION_POOL_SIZE = 15;

// How many containers one cache cycle scans — deliberately small and fixed.
// At the current posting pace (~10 containers per 48h), a full year is
// roughly 1,750 containers; scanning all of them every cycle isn't
// realistic. This walks a bounded slice per cycle instead, via a rotating
// cursor (see fetchDormantContainerSlice) that advances further into the
// past each cycle and wraps back to the 48h edge once it reaches the
// 1-year boundary — full-year coverage emerges over many cycles, not in
// any single one. Documented v1 trade-off: a real burst might not surface
// until a later cycle happens to land on its container slice. Same
// "affordable partial coverage, not a hidden gap" posture already used for
// hashtag-based interest matching (see tagKeywordMatch.ts).
const SAMPLE_CONTAINERS_PER_CYCLE = 30;
const CONTAINER_FETCH_BATCH = 5;

// MIN_CHILDREN_FOR_BURST_CHECK alone doesn't bound *how many* candidates
// clear that bar — confirmed live: a 50-container slice let enough
// survivors through that the per-candidate reply fetch (bounded only by
// concurrency, not by total count) took minutes on a cold cache. This is
// the actual hard cap: highest-children candidates get checked first, the
// rest just wait for a later cycle — same "bounded, not exhaustive"
// posture as the container sampling itself.
const MAX_BURST_CHECK_CANDIDATES_PER_CYCLE = 20;

// Bounded-concurrency reply-timestamp fetch — same worker-pool shape as
// postCategoryCache.ts's getOrFetchPostCategories, reused here rather than
// reimplemented.
const REPLY_FETCH_CONCURRENCY = 5;

// Expensive to build (a container walk plus a per-candidate reply fetch),
// and dormant-then-bursting content doesn't need per-minute freshness —
// hours, not the 2-5 minute TTLs every other pool in this codebase uses.
const RESURRECTION_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface BurstResult {
    isBurst: boolean;
    recentReplyCount: number;
    baselineRate: number;
    recentRate: number;
}

/** Pure core: given one candidate's full reply list (just their `created`
 *  timestamps) and its own `created` date, decides whether it's currently
 *  "bursting" relative to its own history — not a flat threshold, a spike
 *  against its own baseline. Splits replies into "landed in the last
 *  BURST_WINDOW_HOURS" (recent) vs. everything before that (baseline), so
 *  the baseline isn't polluted by the very burst being measured. No I/O —
 *  unit-testable without network. */
export function computeBurstScore(
    replyCreatedTimestamps: string[],
    postCreated: string,
    now: number = Date.now(),
): BurstResult {
    const ageHours = (now - parseHiveTimestamp(postCreated)) / (1000 * 60 * 60);

    const recentTimestamps: string[] = [];
    const baselineTimestamps: string[] = [];
    for (const t of replyCreatedTimestamps) {
        const replyAgeHours = (now - parseHiveTimestamp(t)) / (1000 * 60 * 60);
        if (replyAgeHours <= BURST_WINDOW_HOURS) recentTimestamps.push(t);
        else baselineTimestamps.push(t);
    }

    const baselineAgeHours = Math.max(ageHours - BURST_WINDOW_HOURS, MIN_RATE_AGE_HOURS);
    const baselineRate = baselineTimestamps.length / baselineAgeHours;
    const recentRate = recentTimestamps.length / BURST_WINDOW_HOURS;

    const withinResurrectionAgeBand = ageHours > MAX_AGE_HOURS && ageHours <= RESURRECTION_MAX_AGE_DAYS * 24;
    const isBurst =
        withinResurrectionAgeBand &&
        recentTimestamps.length >= MIN_BURST_REPLIES &&
        recentRate >= BURST_MULTIPLIER * baselineRate;

    return { isBurst, recentReplyCount: recentTimestamps.length, baselineRate, recentRate };
}

interface ScanCursor {
    permlink: string;
    date: string;
}

// Persists across cache cycles (unlike the cache entry itself) — this is
// what turns a bounded per-cycle scan into full-year coverage over time.
let dormantScanCursor: ScanCursor | null = null;

function windowStartDate(): string {
    return new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
}

/** Walks one bounded slice of containers older than the existing 48h
 *  window, starting from wherever the last cycle's cursor left off. Same
 *  get_discussions_by_author_before_date cursor pattern snapTrending.ts's
 *  fetchRawSnapPool already uses — this differs only in where it starts
 *  (the persisted cursor, not "now") and how far it goes (a fixed slice
 *  size, not MAX_CONTAINERS_TO_SCAN). Wraps the cursor back to the 48h edge
 *  once the walk reaches the 1-year boundary or runs out of history. */
async function fetchDormantContainerSlice(): Promise<ExtendedComment[]> {
    const allReplies: ExtendedComment[] = [];
    let permlink = dormantScanCursor?.permlink ?? '';
    let date = dormantScanCursor?.date ?? windowStartDate();
    let containersScanned = 0;
    const cutoffTime = Date.now() - RESURRECTION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    let reachedBoundary = false;

    while (containersScanned < SAMPLE_CONTAINERS_PER_CYCLE) {
        const containers = await HiveClient.database.call('get_discussions_by_author_before_date', [
            CONTAINER_AUTHOR,
            permlink,
            date,
            CONTAINER_FETCH_BATCH,
        ]);

        if (!containers.length) {
            reachedBoundary = true;
            break;
        }

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
        containersScanned += containers.length;

        if (parseHiveTimestamp(date) < cutoffTime) {
            reachedBoundary = true;
            break;
        }
    }

    dormantScanCursor = reachedBoundary ? null : { permlink, date };
    return allReplies;
}

/** Bounded-concurrency fetch of each candidate's full reply list — same
 *  worker-pool shape as postCategoryCache.ts's getOrFetchPostCategories. */
async function fetchReplyTimestamps(
    candidates: ExtendedComment[],
    concurrencyCap: number = REPLY_FETCH_CONCURRENCY,
): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();
    let cursor = 0;

    async function worker() {
        while (cursor < candidates.length) {
            const index = cursor++;
            const candidate = candidates[index];
            try {
                const replies = await HiveClient.database.call('get_content_replies', [
                    candidate.author,
                    candidate.permlink,
                ]);
                results.set(
                    `${candidate.author}/${candidate.permlink}`,
                    (replies as ExtendedComment[]).map(r => r.created),
                );
            } catch {
                // Leave this candidate out rather than fail the whole cycle.
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrencyCap, candidates.length) }, worker);
    await Promise.all(workers);
    return results;
}

async function buildResurrectionPool(): Promise<ExtendedComment[]> {
    const now = Date.now();
    const [dormantCandidates, communityMuted] = await Promise.all([
        fetchDormantContainerSlice(),
        mutedAccountsManager.getMutedList(),
    ]);

    const preFiltered = dormantCandidates
        .filter(item => (item.children ?? 0) >= MIN_CHILDREN_FOR_BURST_CHECK && !communityMuted.has(item.author.toLowerCase()))
        .sort((a, b) => (b.children ?? 0) - (a.children ?? 0))
        .slice(0, MAX_BURST_CHECK_CANDIDATES_PER_CYCLE);

    const replyTimestampsByKey = await fetchReplyTimestamps(preFiltered);

    const bursting: ExtendedComment[] = [];
    for (const candidate of preFiltered) {
        const key = `${candidate.author}/${candidate.permlink}`;
        const replyTimestamps = replyTimestampsByKey.get(key);
        if (!replyTimestamps) continue;

        const burst = computeBurstScore(replyTimestamps, candidate.created, now);
        if (burst.isBurst) {
            bursting.push({ ...candidate, isDiscovery: true, discoveryReason: 'resurrected' });
        }
    }

    return bursting
        .sort((a, b) => (b.children ?? 0) - (a.children ?? 0))
        .slice(0, RESURRECTION_POOL_SIZE);
}

interface CacheEntry {
    expiresAt: number;
    promise: Promise<ExtendedComment[]>;
}

let resurrectionCache: CacheEntry | null = null;

/** Cached pool of currently-bursting dormant content — shared across every
 *  visitor for the TTL window, same "one Hive walk serves everyone" shape
 *  as every other discovery pool in this codebase. Meant to be spliced
 *  (via lib/discovery/interleave.ts's interleaveCandidates) into the
 *  Trending/For You pools, not fetched as its own list. */
export async function fetchResurrectionCandidates(): Promise<ExtendedComment[]> {
    const now = Date.now();
    if (!resurrectionCache || resurrectionCache.expiresAt < now) {
        resurrectionCache = { expiresAt: now + RESURRECTION_CACHE_TTL_MS, promise: buildResurrectionPool() };
    }
    return resurrectionCache.promise;
}
