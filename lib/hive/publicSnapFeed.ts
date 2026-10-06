import { unstable_cache } from 'next/cache';
import HiveClient from '@/lib/hive/hiveclient';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import type { ExtendedComment } from '@/hooks/useComments';
import type { PublicSnapPage } from '@/lib/hive/publicSnapPage';

/**
 * First page of the public "Latest" feed (useSnaps filter `all`).
 *
 * Kept in lockstep with the walk in hooks/useSnaps.ts: same container
 * author, same page size, same 3-container batch, same scan cap. Personal
 * mutes and muted tags are not applied here — those stay client-side, and
 * a logged-in visitor reconciles after hydration. Community mutes are
 * included so a guest's server HTML matches the list the client would have
 * built.
 */
const CONTAINER_AUTHOR = 'peak.snaps';
const PAGE_MIN_SIZE = 10;
const CONTAINERS_PER_CALL = 3;
const MAX_CONTAINERS_PER_FETCH = 30;

export type { PublicSnapPage };

export async function fetchPublicSnapPage(): Promise<PublicSnapPage> {
  const comments: ExtendedComment[] = [];
  let hasMore = true;
  let containersScanned = 0;
  let permlink = '';
  let date = new Date().toISOString();

  const muted = await mutedAccountsManager.getMutedList(undefined);
  const hidden = (author: string) => muted.has(author.toLowerCase());

  while (comments.length < PAGE_MIN_SIZE && hasMore && containersScanned < MAX_CONTAINERS_PER_FETCH) {
    const containers = await HiveClient.database.call('get_discussions_by_author_before_date', [
      CONTAINER_AUTHOR,
      permlink,
      date,
      CONTAINERS_PER_CALL,
    ]);

    if (!containers.length) {
      hasMore = false;
      break;
    }

    containersScanned += containers.length;

    const replies = await Promise.all(
      containers.map((container: { permlink: string }) =>
        HiveClient.database.call('get_content_replies', [CONTAINER_AUTHOR, container.permlink])
      )
    );

    for (let i = 0; i < containers.length; i++) {
      const container = containers[i] as { permlink: string; created: string };
      const batch = (replies[i] as ExtendedComment[]).filter(comment => !hidden(comment.author));
      comments.push(...batch);
      permlink = container.permlink;
      date = container.created;
    }
  }

  return { comments, hasMore, cursor: { permlink, date } };
}

const getCachedPublicSnapPage = unstable_cache(
  () => fetchPublicSnapPage(),
  ['public-default-snap-feed'],
  { revalidate: 30 }
);

/** Cached first page, or null when Hive is unreachable so the client can
 *  fall back to today's fetch instead of failing the route. */
export async function getInitialPublicSnapPage(): Promise<PublicSnapPage | null> {
  try {
    return await getCachedPublicSnapPage();
  } catch (error) {
    console.error('SSR public snap feed failed; the client will fetch it.', error);
    return null;
  }
}
