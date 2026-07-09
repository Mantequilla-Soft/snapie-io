// Throwaway sampler used to build lib/discovery/interestTopics.ts.
// Combflow's category vocabulary isn't documented anywhere — this pulls a
// diverse batch of recent Hive posts (mixed created/trending sort, across
// all communities) and prints the real `categories` values the app's own
// /api/combflow/post/[author]/[permlink] proxy returns for each, so the
// onboarding topic list can be built from observation instead of guesswork.
//
// Usage: node scripts/sample_combflow_categories.mjs [devServerBaseUrl]
// Requires the Next.js dev server running (default http://localhost:3310).

const BASE_URL = process.argv[2] || 'http://localhost:3310';
const HIVE_NODE = 'https://api.hive.blog';
const SAMPLE_SIZE_PER_SORT = 20; // bridge.get_ranked_posts caps limit at 20

async function fetchRankedPosts(sort) {
    const res = await fetch(HIVE_NODE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'bridge.get_ranked_posts',
            params: { sort, tag: '', observer: '', limit: SAMPLE_SIZE_PER_SORT },
            id: 1,
        }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`bridge.get_ranked_posts(${sort}): ${data.error.message}`);
    return data.result;
}

async function fetchCategories(author, permlink) {
    const url = `${BASE_URL}/api/combflow/post/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data.categories) ? data.categories : [];
    } catch {
        return null;
    }
}

async function main() {
    const [created, trending] = await Promise.all([
        fetchRankedPosts('created'),
        fetchRankedPosts('trending'),
    ]);

    const seen = new Set();
    const pairs = [];
    for (const p of [...created, ...trending]) {
        const key = `${p.author}/${p.permlink}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push([p.author, p.permlink]);
    }

    const categoryCounts = new Map();
    let found = 0;
    let notFound = 0;

    for (const [author, permlink] of pairs) {
        const categories = await fetchCategories(author, permlink);
        if (categories === null) {
            notFound++;
            continue;
        }
        found++;
        console.log(`${author}/${permlink} -> [${categories.join(', ')}]`);
        for (const c of categories) {
            categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
        }
    }

    console.log(`\nfound: ${found}, notfound: ${notFound}`);
    console.log('\nCategory frequency:');
    [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => console.log(`${String(count).padStart(3)}  ${cat}`));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
