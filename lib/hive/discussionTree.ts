/**
 * `bridge.get_discussion` returns one map of every post in a thread, keyed
 * `author/permlink`. Each entry's `replies` is a list of those keys, not
 * nested posts. The comment UI expects the direct children of the root,
 * with nested replies already attached.
 */

export interface DiscussionNode {
  author: string
  permlink: string
  replies?: unknown
  [key: string]: unknown
}

export function discussionKey(author: string, permlink: string): string {
  return `${author}/${permlink}`
}

/**
 * condenser `get_content_replies` returns `json_metadata` as a string.
 * `bridge.get_discussion` returns the same field as an object. The comment
 * UI parses it with JSON.parse, which throws on an object and blocks editing.
 */
export function discussionMetadata(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

export function discussionReplies(
  discussion: unknown,
  rootAuthor: string,
  rootPermlink: string,
): DiscussionNode[] {
  if (!discussion || typeof discussion !== 'object') return []
  const map = discussion as Record<string, DiscussionNode>
  const rootKey = discussionKey(rootAuthor, rootPermlink)
  const root = map[rootKey]
  if (!root) return []

  const seen = new Set<string>([rootKey])

  const expand = (refs: unknown): DiscussionNode[] => {
    if (!Array.isArray(refs)) return []
    const out: DiscussionNode[] = []
    for (const ref of refs) {
      if (typeof ref !== 'string' || seen.has(ref)) continue
      const node = map[ref]
      if (!node || typeof node !== 'object' || typeof node.author !== 'string') continue
      seen.add(ref)
      out.push({
        ...node,
        json_metadata: discussionMetadata(node.json_metadata),
        replies: expand(node.replies),
      })
    }
    return out
  }

  return expand(root.replies)
}
