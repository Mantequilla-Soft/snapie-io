/** Hive's condenser_api/database_api return json_metadata as a raw JSON
 *  string; bridge_api (used by findPosts/findFeedPosts for the ranked/feed
 *  post lists) returns it pre-parsed as an object. Both show up as the
 *  `json_metadata` field depending which RPC method fetched the content, so
 *  callers of hasMutedTag can't assume either shape. */
type JsonMetadata = string | Record<string, unknown> | undefined;

/** True when `jsonMetadata`'s tags array includes any of `mutedTags`
 *  (case-insensitive). Never throws — malformed/missing metadata or an empty
 *  mute list just means "nothing to match," not muted. Mirrors the parsing
 *  in lib/discovery/tagKeywordMatch.ts's matchTagsToCategories, and applies
 *  the same way to blog posts, snaps, and comments — they all carry tags in
 *  json_metadata.tags via the shared composer. */
export function hasMutedTag(jsonMetadata: JsonMetadata, mutedTags: string[]): boolean {
  if (!jsonMetadata || mutedTags.length === 0) return false;

  let parsed: any;
  try {
    parsed = typeof jsonMetadata === 'string' ? JSON.parse(jsonMetadata) : jsonMetadata;
  } catch {
    return false;
  }
  const tags: string[] = Array.isArray(parsed?.tags)
    ? parsed.tags.map((t: unknown) => String(t).toLowerCase())
    : [];
  if (tags.length === 0) return false;

  const muted = new Set(mutedTags.map(t => t.toLowerCase()));
  return tags.some(tag => muted.has(tag));
}
