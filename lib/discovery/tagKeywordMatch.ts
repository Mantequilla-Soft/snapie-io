// v1 categorization for snaps/waves — Combflow only classifies top-level
// Hive posts, not comments, and snaps/waves are both technically comments
// (parent_author: peak.snaps / ecency.waves). Confirmed directly: 19/19
// sampled snaps returned "Not found." from Combflow, versus a 39/40 hit
// rate on genuine top-level posts. Building a real classifier for this is
// out of scope (new external dependency, per-item cost/latency, taxonomy
// drift from Combflow's own) — this instead reuses a signal that's already
// fetched for free: the hashtags a snap/wave already tagged itself with, in
// json_metadata.tags. Coverage is necessarily partial (an untagged snap
// matches nothing) — a documented v1 limitation, not a bug. Revisit only if
// production usage shows this pool is too thin.
export const TOPIC_KEYWORDS: Record<string, string[]> = {
    travel: ['travel', 'travelling', 'traveling', 'trip', 'tourism', 'wanderlust'],
    photography: ['photography', 'photo', 'photos', 'photograph'],
    writing: ['writing', 'blog', 'blogging', 'poetry', 'poem', 'story', 'storytelling'],
    'health-fitness': ['health', 'fitness', 'workout', 'gym', 'wellness', 'running'],
    food: ['food', 'foodie', 'cooking', 'recipe', 'recipes', 'cuisine'],
    philosophy: ['philosophy', 'philosophical'],
    spirituality: ['spirituality', 'spiritual', 'faith', 'meditation'],
    music: ['music', 'musician', 'song', 'singing'],
    'movies-tv': ['movie', 'movies', 'tvshow', 'film', 'cinema', 'netflix'],
    gaming: ['gaming', 'game', 'games', 'gamer', 'videogames'],
    programming: ['programming', 'coding', 'developer', 'tech', 'technology', 'software'],
    crypto: ['crypto', 'cryptocurrency', 'bitcoin', 'btc', 'blockchain'],
    hive: ['hive', 'hiveblockchain', 'hivepower'],
    'team-sports': ['sports', 'football', 'soccer', 'basketball', 'baseball'],
    'diy-crafts': ['diy', 'crafts', 'craft', 'handmade'],
    homesteading: ['homesteading', 'garden', 'gardening', 'farm', 'farming', 'harvest'],
    'social-issues': ['activism', 'socialissues', 'humanrights'],
};

/** Parses json_metadata.tags (case-insensitively) and returns which of our
 *  interest-topic category slugs any of those hashtags match. Never throws
 *  — malformed/missing metadata just yields no matches. */
export function matchTagsToCategories(jsonMetadata: string | undefined): string[] {
    if (!jsonMetadata) return [];
    let hashtags: string[];
    try {
        const parsed = JSON.parse(jsonMetadata);
        hashtags = Array.isArray(parsed.tags) ? parsed.tags.map((t: unknown) => String(t).toLowerCase()) : [];
    } catch {
        return [];
    }
    if (hashtags.length === 0) return [];

    const matched = new Set<string>();
    for (const [category, keywords] of Object.entries(TOPIC_KEYWORDS)) {
        if (hashtags.some(tag => keywords.includes(tag))) {
            matched.add(category);
        }
    }
    return [...matched];
}

/** Turns a set of interest-topic category slugs into a single hivesense-api
 *  search query — reuses the same hand-curated keyword lists above rather
 *  than maintaining a second dictionary, and combines every requested
 *  category into one query (one search call per tag *combination*, not one
 *  per tag) to keep call volume down against a shared public node. Unknown
 *  slugs contribute nothing rather than erroring. */
export function buildTopicSearchQuery(tags: string[]): string {
    const keywords = new Set<string>();
    for (const tag of tags) {
        for (const keyword of TOPIC_KEYWORDS[tag] ?? []) {
            keywords.add(keyword);
        }
    }
    return [...keywords].join(' ');
}
