import { connectDB } from '@/lib/db/mongodb';
import { PostCategory, IPostCategory } from '@/lib/db/models/PostCategory';
import { fetchCombflowPost } from '@/lib/combflow/client';

// Combflow classification is effectively static (a post's topic doesn't
// change after it's written) — 30 days is conservative, not a guess at
// actual staleness.
const FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PostCategoryResult {
    categories: string[];
    sentiment?: string;
    sentimentScore?: number;
    primaryLanguage?: string;
    isNsfw?: boolean;
}

function toResult(doc: IPostCategory): PostCategoryResult {
    return {
        categories: doc.categories,
        sentiment: doc.sentiment,
        sentimentScore: doc.sentimentScore,
        primaryLanguage: doc.primaryLanguage,
        isNsfw: doc.isNsfw,
    };
}

/** Mongo-backed cache in front of Combflow's per-post-only lookup. Fresh
 *  cache hit -> no Combflow call at all. Missing/stale -> calls Combflow,
 *  upserts, returns fresh data. Combflow failure -> falls back to the
 *  existing stale doc if one exists (never worse than what we already had),
 *  else null — same graceful-degrade posture as the rest of the discovery
 *  routes (see app/api/feed/route.ts). */
export async function getOrFetchPostCategory(author: string, permlink: string): Promise<PostCategoryResult | null> {
    const id = `${author}/${permlink}`;
    await connectDB();

    const existing = await PostCategory.findById(id);
    const isFresh = existing && Date.now() - existing.cachedAt.getTime() < FRESHNESS_MS;
    if (existing && isFresh) {
        return toResult(existing);
    }

    try {
        const data = await fetchCombflowPost(author, permlink);
        const updated = await PostCategory.findByIdAndUpdate(
            id,
            {
                _id: id,
                categories: data.categories || [],
                sentiment: data.sentiment,
                sentimentScore: data.sentiment_score,
                primaryLanguage: data.primary_language,
                isNsfw: data.is_nsfw,
                cachedAt: new Date(),
            },
            { upsert: true, new: true },
        );
        return toResult(updated);
    } catch {
        return existing ? toResult(existing) : null;
    }
}

/** Bounded-concurrency batch wrapper — makes categorizing a cross-community
 *  candidate pool (dozens of never-before-seen posts) affordable instead of
 *  firing one Combflow request per candidate simultaneously. */
export async function getOrFetchPostCategories(
    candidates: { author: string; permlink: string }[],
    concurrencyCap: number = 5,
): Promise<Map<string, PostCategoryResult>> {
    const results = new Map<string, PostCategoryResult>();
    let cursor = 0;

    async function worker() {
        while (cursor < candidates.length) {
            const index = cursor++;
            const { author, permlink } = candidates[index];
            const result = await getOrFetchPostCategory(author, permlink);
            if (result) results.set(`${author}/${permlink}`, result);
        }
    }

    const workers = Array.from({ length: Math.min(concurrencyCap, candidates.length) }, worker);
    await Promise.all(workers);
    return results;
}
