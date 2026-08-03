import HiveClient from './hiveclient';

/**
 *  Shared, cached Hive account lookups for mention autocomplete + validation
 *  (blog composer, snap composer — see MentionHighlightedTextarea). Kept
 *  framework-agnostic and outside React so both composers, and any future
 *  caller, share one cache instead of each paying for its own RPC calls.
 *
 *  Two different RPCs for two different questions:
 *   - "what could this partial be?"   -> condenser_api.lookup_accounts
 *     (server-side prefix match, one call per novel prefix)
 *   - "is this exact name real?"      -> database_api.get_accounts (batched)
 */

const PREFIX_CACHE = new Map<string, string[]>();
// Prefixes whose cached result is known-complete (fewer than the requested
// limit came back) — a longer prefix built on top of one of these can be
// answered by filtering the cached array locally, no RPC needed at all.
const COMPLETE_PREFIXES = new Set<string>();

const VALID_USERNAMES = new Set<string>();
const INVALID_USERNAMES = new Set<string>();

function longestCompletePrefixOf(prefix: string): string | null {
  for (let len = prefix.length - 1; len >= 3; len--) {
    const candidate = prefix.slice(0, len);
    if (COMPLETE_PREFIXES.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Up to `limit` Hive usernames starting with `prefix` (lowercase). Empty
 * array for anything under Hive's 3-character minimum — there's nothing a
 * real RPC could resolve there anyway.
 */
export async function searchUsernamesByPrefix(prefix: string, limit = 8): Promise<string[]> {
  const p = prefix.trim().toLowerCase();
  if (p.length < 3) return [];

  const cached = PREFIX_CACHE.get(p);
  if (cached) return cached.slice(0, limit);

  // A shorter prefix already returned everything there is — filter that
  // instead of asking the node again.
  const base = longestCompletePrefixOf(p);
  if (base) {
    const filtered = PREFIX_CACHE.get(base)!.filter(name => name.startsWith(p));
    PREFIX_CACHE.set(p, filtered);
    if (filtered.length < limit) COMPLETE_PREFIXES.add(p);
    return filtered.slice(0, limit);
  }

  try {
    const results = (await HiveClient.call('condenser_api', 'lookup_accounts', [p, limit])) as string[];
    PREFIX_CACHE.set(p, results);
    if (results.length < limit) COMPLETE_PREFIXES.add(p);
    for (const name of results) VALID_USERNAMES.add(name);
    return results;
  } catch {
    return [];
  }
}

/**
 * Which of `names` are real Hive accounts. Only queries the ones not already
 * resolved (valid or invalid) by a previous call — including ones already
 * confirmed via searchUsernamesByPrefix, so picking a dropdown suggestion
 * never costs a second lookup.
 */
export async function validateUsernames(names: string[]): Promise<Set<string>> {
  const distinct = Array.from(new Set(names.map(n => n.toLowerCase()))).filter(Boolean);
  const unknown = distinct.filter(n => !VALID_USERNAMES.has(n) && !INVALID_USERNAMES.has(n));

  if (unknown.length > 0) {
    try {
      const accounts = await HiveClient.database.getAccounts(unknown);
      const found = new Set(accounts.map(a => a.name));
      for (const name of unknown) {
        if (found.has(name)) VALID_USERNAMES.add(name);
        else INVALID_USERNAMES.add(name);
      }
    } catch {
      // Leave `unknown` names unresolved rather than guessing either way —
      // the caller will just see them as neither valid nor invalid this pass.
    }
  }

  return new Set(distinct.filter(n => VALID_USERNAMES.has(n)));
}

/** Synchronous check against what's already cached — no network, no await.
 *  Used to render a mention's color immediately from a prior resolution
 *  (e.g. one just picked from the dropdown) without waiting on a fresh pass. */
export function getKnownValidity(name: string): boolean | null {
  const n = name.toLowerCase();
  if (VALID_USERNAMES.has(n)) return true;
  if (INVALID_USERNAMES.has(n)) return false;
  return null;
}
