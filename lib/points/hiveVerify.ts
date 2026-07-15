import HiveClient from '@/lib/hive/hiveclient';
import { PointsActionType } from '@/lib/points/constants';

interface HiveComment {
  author: string;
  permlink: string;
  depth: number;
  parent_author: string;
  json_metadata: string;
  active_votes?: { voter: string }[];
}

/** Attribution signal for content: the post self-tagged as a Snapie app
 *  (snapie.io / snapie-mobile). Malformed metadata → not attributed. */
function isSnapieApp(jsonMetadata: string): boolean {
  try {
    const app = JSON.parse(jsonMetadata || '{}')?.app;
    return typeof app === 'string' && app.toLowerCase().startsWith('snapie');
  } catch {
    return false;
  }
}

async function getContent(author: string, permlink: string): Promise<HiveComment | null> {
  const res = await HiveClient.database.call('get_content', [author, permlink]);
  // get_content returns a stub with author === '' when the post doesn't exist.
  if (!res || !res.author) return null;
  return res as HiveComment;
}

async function getRebloggedBy(author: string, permlink: string): Promise<string[]> {
  const res = await HiveClient.database.call('get_reblogged_by', [author, permlink]);
  return Array.isArray(res) ? res : [];
}

// Spread over ~6s to ride out block propagation right after a broadcast — the
// post/vote a user just made may not be queryable on our node for a few seconds.
const RETRY_DELAYS_MS = [0, 2000, 4000];

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type VerifyOutcome = 'ok' | 'unverified' | 'self';

/** Confirms an action provably happened on-chain and belongs to `username`.
 *  `author`/`permlink` identify the TARGET: the user's own post for content
 *  actions, or the post being voted/reblogged for those. Also enforces the
 *  no-self-dealing rule (a decision that needs the same on-chain data, so it
 *  lives here). Returns 'self' for disallowed self-actions, 'unverified' when
 *  the action can't be confirmed after retries, 'ok' otherwise. */
export async function verifyAction(
  actionType: PointsActionType,
  username: string,
  author: string,
  permlink: string,
): Promise<VerifyOutcome> {
  // Voting/reblogging your own post: cheap reject before any network call.
  if ((actionType === 'vote' || actionType === 'reblog') && eq(author, username)) return 'self';

  for (const wait of RETRY_DELAYS_MS) {
    if (wait) await delay(wait);
    try {
      if (actionType === 'reblog') {
        const accounts = await getRebloggedBy(author, permlink);
        if (accounts.some(a => eq(a, username))) return 'ok';
        continue; // maybe not propagated yet — retry
      }

      const content = await getContent(author, permlink);
      if (!content) continue; // not propagated yet — retry

      if (actionType === 'vote') {
        if (content.active_votes?.some(v => v.voter && eq(v.voter, username))) return 'ok';
        continue;
      }

      // Content actions (blog/snap/comment): must be authored by the user and
      // tagged as a Snapie app. Authorship is definitive — no retry helps.
      if (!eq(content.author, username)) return 'unverified';
      if (!isSnapieApp(content.json_metadata)) return 'unverified';
      // No reward for commenting on your own post.
      if (actionType === 'comment' && eq(content.parent_author, username)) return 'self';
      if (actionType === 'blog' && content.depth === 0) return 'ok';
      if ((actionType === 'snap' || actionType === 'comment') && content.depth > 0) return 'ok';
      return 'unverified';
    } catch {
      // Transient node error — let the retry loop try another node/attempt.
    }
  }
  return 'unverified';
}
