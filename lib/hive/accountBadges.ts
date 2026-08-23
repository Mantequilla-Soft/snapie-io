import HiveClient from '@/lib/hive/hiveclient';

/**
 * PeakD's "badge" convention: a Hive account named badge-XXXXXX represents a
 * badge definition, and it "follows" every account that holds that badge —
 * a normal follow relationship reused as free, decentralized storage for
 * badge-holder lists. The badge account's own profile metadata supplies the
 * badge's name/description/icon. See internal-docs for the full writeup;
 * confirmed live against PeakD's own profile DOM and a handful of real
 * badge accounts' metadata before building this.
 *
 * 348 badge-* accounts exist on Hive today (measured via lookup_accounts),
 * a small enough catalog to walk in full and cache, rather than scanning
 * any single profile's own (potentially huge) follower list looking for
 * badge-prefixed names on every page view.
 */

export interface BadgeMeta {
  account: string;
  name: string;
  about: string;
  image: string;
}

const BADGE_PREFIX = 'badge-';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Defensive cap on how many pages of a single badge account's following
// list we'll walk — mirrors snapTrending.ts's MAX_CONTAINERS_TO_SCAN safety
// valve. 50 pages * 1000 = 50,000 holders, comfortably above the largest
// sampled badge (1319) with room to spare.
const MAX_PAGES_PER_BADGE = 50;
const FOLLOWING_PAGE_LIMIT = 1000;
// How many badge accounts' following-lists to walk concurrently while
// building the index — bounds load on the RPC node without making the
// ~348-account build take forever sequentially.
const BUILD_CONCURRENCY = 12;

interface BadgeIndex {
  /** lowercase username -> badge account names */
  holders: Map<string, string[]>;
  catalog: Map<string, BadgeMeta>;
}

interface CacheEntry {
  expiresAt: number;
  data: BadgeIndex;
}

// Module-level, shared by every request in this process for the TTL window —
// same assumption lib/discovery/snapTrending.ts and lib/hive/muted-accounts.ts
// already rely on (Snapie runs as a long-lived PM2 process, not serverless).
// Reset on every deploy; that's fine, it just rebuilds on the next request.
let cache: CacheEntry | null = null;
// Deduplicates a background rebuild in flight — same idea as
// mutedAccountsManager's `loading` map, just for a single shared index
// instead of one per observer.
let rebuildPromise: Promise<BadgeIndex> | null = null;

function parseBadgeMeta(account: string, postingJsonMetadata: unknown, jsonMetadata: unknown): BadgeMeta {
  for (const raw of [postingJsonMetadata, jsonMetadata]) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const profile = parsed?.profile;
      if (profile && (profile.name || profile.about || profile.profile_image)) {
        return {
          account,
          name: profile.name || account,
          about: profile.about || '',
          image: profile.profile_image || '',
        };
      }
    } catch {
      // fall through to the next source, or the bare-name fallback below
    }
  }
  return { account, name: account, about: '', image: '' };
}

/** Every badge-* account on Hive, with its profile metadata. A single
 *  lookup_accounts call comfortably covers today's 348; loops further only
 *  if the catalog ever grows past 1000 (not expected). */
async function fetchBadgeCatalog(): Promise<Map<string, BadgeMeta>> {
  const names: string[] = [];
  let start = BADGE_PREFIX;
  while (true) {
    const page = (await HiveClient.call('condenser_api', 'lookup_accounts', [start, 1000])) as string[];
    const matched = page.filter(n => n.startsWith(BADGE_PREFIX));
    names.push(...matched);
    // Stopped short of a full page of matches, or hit a name that doesn't
    // match at all — either way we've walked past the badge- region.
    if (matched.length < page.length || matched.length < 1000) break;
    start = matched[matched.length - 1];
  }

  const catalog = new Map<string, BadgeMeta>();
  if (names.length === 0) return catalog;

  const accounts = await HiveClient.database.getAccounts(names);
  for (const acc of accounts) {
    catalog.set(acc.name, parseBadgeMeta(acc.name, (acc as any).posting_json_metadata, (acc as any).json_metadata));
  }
  return catalog;
}

/** Same RPC call lib/hive/client-functions.ts's getFollowing wraps — inlined
 *  rather than imported, since that module starts with 'use client' and its
 *  exports aren't safely callable from a pure server context (RSC/API route)
 *  even though they're plain async functions, not components. */
async function getFollowingPage(account: string, start: string, limit: number): Promise<string[]> {
  try {
    const result = (await HiveClient.database.call('get_following', [account, start, 'blog', limit])) as Array<{ following: string }>;
    return result.map(item => item.following).filter(Boolean);
  } catch {
    return [];
  }
}

/** Every holder of a single badge — pages get_following to completion.
 *  Hive's start-cursor is inclusive (the account named in `start` comes
 *  back again as the first item of the next page), so a Set here — not a
 *  plain accumulate — same boundary-duplicate class of bug already handled
 *  elsewhere in this codebase (e.g. RightSideBar.tsx's seenKeysRef). */
async function fetchBadgeHolders(badgeAccount: string): Promise<string[]> {
  const holders = new Set<string>();
  let start = '';
  let pages = 0;
  while (pages < MAX_PAGES_PER_BADGE) {
    const page = await getFollowingPage(badgeAccount, start, FOLLOWING_PAGE_LIMIT);
    if (page.length === 0) break;
    for (const h of page) holders.add(h);
    if (page.length < FOLLOWING_PAGE_LIMIT) break;
    start = page[page.length - 1];
    pages++;
  }
  return Array.from(holders);
}

async function processInChunks<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function buildBadgeIndex(): Promise<BadgeIndex> {
  const catalog = await fetchBadgeCatalog();
  const holders = new Map<string, string[]>();

  await processInChunks(Array.from(catalog.keys()), BUILD_CONCURRENCY, async badgeAccount => {
    const badgeHolders = await fetchBadgeHolders(badgeAccount);
    for (const holder of badgeHolders) {
      const key = holder.toLowerCase();
      const existing = holders.get(key);
      if (existing) existing.push(badgeAccount);
      else holders.set(key, [badgeAccount]);
    }
  });

  return { catalog, holders };
}

/** Fresh cache: return it directly. Stale cache: serve the old data
 *  immediately and refresh in the background (deduped) — a full rebuild is
 *  ~350+ Hive calls, too slow to make any single profile-page request wait
 *  on. Only a genuinely cold cache (nothing built yet, e.g. right after a
 *  deploy) has nothing to serve and must block. */
async function getBadgeIndex(): Promise<BadgeIndex> {
  const now = Date.now();
  if (cache && cache.expiresAt >= now) return cache.data;

  if (cache) {
    if (!rebuildPromise) {
      rebuildPromise = buildBadgeIndex()
        .then(data => {
          cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
          return data;
        })
        .finally(() => {
          rebuildPromise = null;
        });
      rebuildPromise.catch(() => {}); // background refresh — don't let a rejection go unhandled
    }
    return cache.data;
  }

  if (!rebuildPromise) {
    rebuildPromise = buildBadgeIndex()
      .then(data => {
        cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
        return data;
      })
      .finally(() => {
        rebuildPromise = null;
      });
  }
  return rebuildPromise;
}

export async function getBadgesForUser(username: string): Promise<BadgeMeta[]> {
  const index = await getBadgeIndex();
  const badgeAccounts = index.holders.get(username.toLowerCase()) || [];
  return badgeAccounts
    .map(account => index.catalog.get(account))
    .filter((b): b is BadgeMeta => Boolean(b));
}
