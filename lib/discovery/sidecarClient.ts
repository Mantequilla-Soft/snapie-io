import { ExtendedComment } from '@/hooks/useComments';

const SIDECAR_URL = process.env.HIVE_ACTIVITY_SIDECAR_URL ?? 'http://127.0.0.1:3099';

export interface SidecarFeedItem {
    source: 'snap' | 'wave';
    author: string;
    permlink: string;
    created: string;
    parentAuthor: string;
    parentPermlink: string;
    body?: string;
    json_metadata?: string;
    active_votes?: ExtendedComment['active_votes'];
    children?: number;
}

export interface SidecarFeedResult {
    items: SidecarFeedItem[];
    hasMore: boolean;
}

/** Fetch + timeout + graceful-fallback wrapper around the external sidecar
 *  process's unfiltered, cursor-paginated /feed endpoint (see
 *  internal-docs/hive-activity-sidecar-feed.md). Used both by
 *  app/api/feed/route.ts (the existing "Latest" blended feed) and by the
 *  warm "For You" pool builder (lib/discovery/forYouWarm.ts) — extracted so
 *  both share identical timeout/degrade behavior instead of duplicating it.
 *  The sidecar is a separate, unmodifiable process — any failure (down,
 *  slow, malformed response) degrades to an empty result, never throws. */
export async function fetchSidecarFeed(params: { before?: string; limit: number }): Promise<SidecarFeedResult> {
    try {
        const qs = new URLSearchParams({ limit: String(params.limit) });
        if (params.before) qs.set('before', params.before);
        const res = await fetch(`${SIDECAR_URL}/feed?${qs.toString()}`, {
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return { items: [], hasMore: false };
        return await res.json();
    } catch {
        return { items: [], hasMore: false };
    }
}
