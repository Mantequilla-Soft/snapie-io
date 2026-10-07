import { unstable_cache } from 'next/cache';
import type { ExtendedComment } from '@/hooks/useComments';
import { fetchSidecarFeed, type SidecarFeedItem } from '@/lib/discovery/sidecarClient';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { toSeedComment } from '@/lib/hive/publicSnapFeed';
import { PUBLIC_SNAP_SEED_COUNT, type PublicSnapPage } from '@/lib/hive/publicSnapPage';

/**
 * First page of blended Latest (snaps + waves from the activity sidecar).
 *
 * Same mute rule as the snaps seed: community mutes are applied here so a
 * guest's HTML matches the list useBlendedFeed would have built. Personal
 * mutes and muted tags stay client-side; a logged-in visitor refetches.
 *
 * The seed is the newest PUBLIC_SNAP_SEED_COUNT items, not the client's
 * 30-item scroll page. useBlendedFeed resumes at `before` (the oldest
 * seeded `created`), which is the same cursor it would have stored after
 * consuming that prefix, so the next page neither skips nor repeats it.
 */

type BlendedSeedItem = SidecarFeedItem & {
  title?: string;
  pending_payout_value?: string;
  total_payout_value?: string;
  curator_payout_value?: string;
  net_votes?: number;
  voteCount?: number;
};

function asMetadataString(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Card fields only, plus the wave/snap source the badge reads. */
export function toBlendedSeedComment(item: BlendedSeedItem): ExtendedComment {
  const seeded = toSeedComment({
    author: item.author,
    permlink: item.permlink,
    created: item.created,
    body: item.body,
    children: item.children,
    parent_author: item.parentAuthor,
    parent_permlink: item.parentPermlink,
    title: item.title,
    json_metadata: asMetadataString(item.json_metadata),
    pending_payout_value: item.pending_payout_value,
    total_payout_value: item.total_payout_value,
    curator_payout_value: item.curator_payout_value,
    active_votes: item.active_votes,
    voteCount: item.voteCount,
    net_votes: item.net_votes,
  });
  return { ...seeded, source: item.source };
}

export async function fetchPublicBlendedPage(): Promise<PublicSnapPage | null> {
  const data = await fetchSidecarFeed({ limit: PUBLIC_SNAP_SEED_COUNT });
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) return null;

  const muted = await mutedAccountsManager.getMutedList(undefined);
  const hidden = (author: string | undefined) => !author || muted.has(author.toLowerCase());

  const seen = new Set<string>();
  const visible: BlendedSeedItem[] = [];
  for (const item of items) {
    if (!item?.permlink || hidden(item.author)) continue;
    if (seen.has(item.permlink)) continue;
    seen.add(item.permlink);
    visible.push(item);
  }
  if (visible.length === 0) return null;

  const comments = visible.map(toBlendedSeedComment);
  const before = comments[comments.length - 1]?.created ?? null;
  return {
    comments,
    hasMore: Boolean(data.hasMore),
    cursor: null,
    before,
  };
}

const getCachedPublicBlendedPage = unstable_cache(
  () => fetchPublicBlendedPage(),
  ['public-blended-snap-feed'],
  { revalidate: 30 },
);

/** Cached blended first page, or null when the sidecar has nothing to
 *  paint. The client then fetches /api/feed and can fall back to snaps. */
export async function getInitialPublicBlendedPage(): Promise<PublicSnapPage | null> {
  try {
    return await getCachedPublicBlendedPage();
  } catch (error) {
    console.error('SSR blended snap feed failed; the client will fetch it.', error);
    return null;
  }
}
