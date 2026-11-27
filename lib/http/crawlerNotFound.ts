/**
 * Real 404s for missing Hive posts and accounts.
 *
 * The root layout wraps every page in <Suspense> (and app/loading.tsx adds
 * another boundary), so the 200 shell is sent before a page or
 * generateMetadata can call notFound(). Middleware runs before rendering and
 * asks Hive whether the post or account exists, then rewrites to a 404 when
 * Hive says it doesn't — for every GET/HEAD, not only crawlers.
 *
 * Only a definite answer from Hive is a 404. A timeout, a node error or
 * anything unexpected is `unknown`, and the page renders as usual, so a sick
 * node can never get a live post deindexed.
 *
 * Plain fetch (no dhive) so it runs in the middleware runtime.
 */

export type HiveExistence = 'found' | 'missing' | 'unknown';

const NODES = ['https://api.hive.blog', 'https://api.openhive.network'];
// One budget for both nodes. A hung node used to cost 2s, then the next node
// another 2s, so a cold page could sit for about 4s. The first node gets a
// slice of the budget so a hang still leaves time to ask the second.
const OVERALL_DEADLINE_MS = 1500;
const FIRST_NODE_BUDGET_MS = 800;
const FOUND_TTL_MS = 5 * 60_000;
// A brand-new post can be missing on the node for a block or two. Caching
// that for the full found-TTL would 404 the author (and anyone they share
// the link with) until the entry expired.
const MISSING_TTL_MS = 30_000;
const MAX_ENTRIES = 1000;

// Per-instance memory. Repeat loads of a post that exists skip Hive.
// `missing` is kept only briefly; `unknown` is never stored.
const cache = new Map<string, { status: 'found' | 'missing'; at: number }>();

type Fetch = typeof fetch;

type RpcReply = {
  result?: unknown;
  error?: { data?: { name?: unknown; extension?: { assertion_expression?: unknown } } };
};

type CancelableSignal = { signal: AbortSignal; cancel: () => void };

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) timer.unref();
}

function abortAfter(ms: number): CancelableSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  unrefTimer(timer);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Abort when `parent` aborts or `ms` elapses.
 * The edge runtime's AbortSignal has timeout() and abort() but not any(),
 * and calling the missing method used to skip both Hive nodes (#411).
 */
function abortWithin(parent: AbortSignal, ms: number): CancelableSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  unrefTimer(timer);
  const onParent = () => controller.abort();
  if (parent.aborted) controller.abort();
  else parent.addEventListener('abort', onParent, { once: true });
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onParent);
    },
  };
}

async function rpc(method: string, params: unknown[], fetchImpl: Fetch): Promise<RpcReply | null> {
  const started = Date.now();
  const overall = abortAfter(OVERALL_DEADLINE_MS);
  try {
    for (let i = 0; i < NODES.length; i++) {
      const remaining = OVERALL_DEADLINE_MS - (Date.now() - started);
      if (remaining <= 0 || overall.signal.aborted) return null;
      const budget = i === 0 ? Math.min(remaining, FIRST_NODE_BUDGET_MS) : remaining;
      const attempt = abortWithin(overall.signal, budget);
      try {
        const res = await fetchImpl(NODES[i], {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: attempt.signal,
        });
        if (!res.ok) continue;
        const reply = (await res.json()) as RpcReply;
        if (reply && typeof reply === 'object' && ('result' in reply || 'error' in reply)) return reply;
      } catch {
        // Timeout or network error: try the next node, inside the same budget.
      } finally {
        attempt.cancel();
      }
    }
    return null;
  } finally {
    overall.cancel();
  }
}

function ttlFor(status: 'found' | 'missing'): number {
  return status === 'found' ? FOUND_TTL_MS : MISSING_TTL_MS;
}

async function cached(key: string, lookup: () => Promise<HiveExistence>): Promise<HiveExistence> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlFor(hit.status)) return hit.status;
  const status = await lookup();
  if (status !== 'unknown') {
    if (!cache.has(key) && cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { status, at: Date.now() });
  }
  return status;
}

/** A Hive account name: 3-16 chars, lowercase letters, digits, dots and dashes. */
function isPlausibleAccount(name: string): boolean {
  return name.length >= 3 && name.length <= 16 && /^[a-z][a-z0-9.-]*[a-z0-9]$/.test(name);
}

export function hiveAccountStatus(username: string, fetchImpl: Fetch = fetch): Promise<HiveExistence> {
  // No Hive account can have this name, so there is nothing to look up.
  if (!isPlausibleAccount(username)) return Promise.resolve('missing');
  return cached(`account:${username}`, async () => {
    const reply = await rpc('condenser_api.get_accounts', [[username]], fetchImpl);
    if (!reply || !Array.isArray(reply.result)) return 'unknown';
    return reply.result.length > 0 ? 'found' : 'missing';
  });
}

export function hivePostStatus(author: string, permlink: string, fetchImpl: Fetch = fetch): Promise<HiveExistence> {
  if (!isPlausibleAccount(author)) return Promise.resolve('missing');
  if (!permlink) return Promise.resolve('unknown');
  return cached(`post:${author}/${permlink}`, async () => {
    const reply = await rpc('condenser_api.get_content', [author, permlink], fetchImpl);
    if (!reply) return 'unknown';
    if (reply.error) {
      // hived answers a missing post with this assert, not an empty result.
      const data = reply.error.data;
      const expression = data?.extension?.assertion_expression;
      const missing = data?.name === 'assert_exception'
        && typeof expression === 'string'
        && /^Post .+ does not exist$/.test(expression);
      return missing ? 'missing' : 'unknown';
    }
    const post = reply.result as { author?: unknown } | null;
    if (!post || typeof post !== 'object') return 'unknown';
    return post.author ? 'found' : 'missing';
  });
}

/** Test hook. */
export function clearCrawlerNotFoundCache(): void {
  cache.clear();
}
