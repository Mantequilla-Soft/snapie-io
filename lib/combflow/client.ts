export interface CombflowPostData {
    categories: string[];
    sentiment?: string;
    sentiment_score?: number;
    primary_language?: string;
    is_nsfw?: boolean;
    languages?: string[];
}

export class CombflowHttpError extends Error {
    constructor(public status: number) {
        super(`Combflow returned ${status}`);
    }
}

/** Direct call to Combflow's per-post classification endpoint — no bulk/
 *  category-listing endpoint exists, only this one-post-at-a-time lookup.
 *  Used both by the existing thin proxy route
 *  (app/api/combflow/post/[author]/[permlink]/route.ts) and by the
 *  Mongo-backed cache populator (lib/discovery/postCategoryCache.ts), so
 *  both share identical fetch behavior instead of duplicating it.
 *  Throws CombflowHttpError (preserving the original status code) on a
 *  non-OK response, or a plain Error on a network failure — callers that
 *  need to distinguish "not found" from "unreachable" (like the proxy
 *  route) can check `instanceof CombflowHttpError`. */
export async function fetchCombflowPost(author: string, permlink: string): Promise<CombflowPostData> {
    const res = await fetch(
        `https://combflow.net/posts/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`,
        { headers: { accept: 'application/json' }, next: { revalidate: 300 } }
    );
    if (!res.ok) {
        throw new CombflowHttpError(res.status);
    }
    return res.json();
}
