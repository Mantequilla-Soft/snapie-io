import { unstable_cache } from 'next/cache';
import HiveClient from '@/lib/hive/hiveclient';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import type { ExtendedComment } from '@/hooks/useComments';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_SNAP_SEED_COUNT, type PublicSnapPage, type SnapFeedCursor } from '@/lib/hive/publicSnapPage';

/**
 * First viewport of the public "Latest" feed (useSnaps filter `all`).
 *
 * Same container author and community-mute filter as hooks/useSnaps.ts.
 * The client page still walks three containers at a time looking for ten
 * snaps; this seed stops at PUBLIC_SNAP_SEED_COUNT and fetches one
 * container at a time so a fat container is not followed by two more
 * get_content_replies calls whose bodies never reach the HTML.
 *
 * Personal mutes and muted tags stay client-side. A logged-in visitor
 * refetches. Community mutes are applied here so a guest's server HTML
 * matches the list the client would have built.
 *
 * Only the fields a card renders are serialized. The raw active_votes
 * array (often hundreds of voter objects) becomes voteCount. json_metadata
 * keeps tags, which the community badge and the muted-tag filter read.
 */
const CONTAINER_AUTHOR = 'peak.snaps';
const MAX_CONTAINERS_PER_FETCH = 30;

export type { PublicSnapPage };

function tagsOnlyMetadata(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as { tags?: unknown };
    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    return JSON.stringify({ tags });
  } catch {
    return '';
  }
}

/** Fields read off a condenser reply. `pending_payout_value` lives on
 *  dhive's Discussion, not Comment, but get_content_replies returns it. */
interface HiveReply {
  author: string;
  permlink: string;
  created: string;
  body?: string;
  children?: number;
  parent_author?: string;
  parent_permlink?: string;
  title?: string;
  json_metadata?: string;
  pending_payout_value?: string;
  total_payout_value?: string;
  curator_payout_value?: string;
  active_votes?: unknown[];
  voteCount?: number;
  net_votes?: number;
}

/** Whitelist of fields Snap and its payout/badge helpers actually read. */
export function toSeedComment(comment: HiveReply): ExtendedComment {
  const voteCount = comment.active_votes?.length ?? comment.voteCount ?? comment.net_votes ?? 0;
  return {
    author: comment.author,
    permlink: comment.permlink,
    created: comment.created,
    body: comment.body ?? '',
    children: comment.children ?? 0,
    parent_author: comment.parent_author ?? '',
    parent_permlink: comment.parent_permlink ?? '',
    title: comment.title ?? '',
    json_metadata: tagsOnlyMetadata(comment.json_metadata),
    pending_payout_value: comment.pending_payout_value,
    total_payout_value: comment.total_payout_value,
    curator_payout_value: comment.curator_payout_value,
    voteCount,
  } as unknown as ExtendedComment;
}

export async function fetchPublicSnapPage(): Promise<PublicSnapPage> {
  const comments: ExtendedComment[] = [];
  let hasMore = true;
  let containersScanned = 0;
  let permlink = '';
  let date = new Date().toISOString();
  // Last container whose replies were all included. Null until that happens,
  // which is the common case: the newest container alone holds far more than
  // PUBLIC_SNAP_SEED_COUNT snaps.
  let cursor: SnapFeedCursor | null = null;

  const muted = await mutedAccountsManager.getMutedList(undefined);
  const hidden = (author: string) => muted.has(author.toLowerCase());

  while (comments.length < PUBLIC_SNAP_SEED_COUNT && hasMore && containersScanned < MAX_CONTAINERS_PER_FETCH) {
    const containers = await HiveClient.database.call('get_discussions_by_author_before_date', [
      CONTAINER_AUTHOR,
      permlink,
      date,
      1,
    ]);

    if (!containers.length) {
      hasMore = false;
      break;
    }

    containersScanned += containers.length;
    const container = containers[0] as { permlink: string; created: string };
    const replies = await HiveClient.database.call('get_content_replies', [
      CONTAINER_AUTHOR,
      container.permlink,
    ]) as HiveReply[];
    // SnapList orders the feed by created, newest first. Hive's reply array
    // is not that order, so slicing it would paint older snaps and then jump
    // when the client loads the rest of the container and sorts.
    const visible = replies.filter(comment => !hidden(comment.author));
    visible.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    const room = PUBLIC_SNAP_SEED_COUNT - comments.length;

    if (visible.length > room) {
      comments.push(...visible.slice(0, room).map(toSeedComment));
      // This container still has replies the seed did not take. Leave the
      // cursor on the previous fully consumed container (or null) so the
      // client re-reads this one and dedupes the prefix.
      hasMore = true;
      break;
    }

    comments.push(...visible.map(toSeedComment));
    cursor = { permlink: container.permlink, date: container.created };
    permlink = container.permlink;
    date = container.created;
  }

  if (comments.length >= PUBLIC_SNAP_SEED_COUNT) {
    hasMore = true;
  }

  return { comments, hasMore, cursor };
}

const getCachedPublicSnapPage = unstable_cache(
  () => fetchPublicSnapPage(),
  ['public-default-snap-feed'],
  { revalidate: 30 }
);

/** Measurement switch. `SNAPIE_PINNED_FEED=1` serves the checked-in first
 *  page instead of Hive, so two Lighthouse runs compare the same snaps.
 *  Unset (production) always uses the live feed. */
export function pinnedHomeFeedEnabled(): boolean {
  return process.env.SNAPIE_PINNED_FEED === '1';
}

export function loadPinnedHomeFeed(): PublicSnapPage {
  const raw = readFileSync(join(process.cwd(), 'lib/hive/pinnedHomeFeed.json'), 'utf8');
  return JSON.parse(raw) as PublicSnapPage;
}

/** Cached first page, or null when Hive is unreachable so the client can
 *  fall back to today's fetch instead of failing the route. */
export async function getInitialPublicSnapPage(): Promise<PublicSnapPage | null> {
  if (pinnedHomeFeedEnabled()) return loadPinnedHomeFeed();
  try {
    return await getCachedPublicSnapPage();
  } catch (error) {
    console.error('SSR public snap feed failed; the client will fetch it.', error);
    return null;
  }
}
