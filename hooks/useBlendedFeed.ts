'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ExtendedComment } from './useComments';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { hasMutedTag } from '@/lib/hive/mutedTags';
import { useUserSettings } from './useUserSettings';
import { getPost } from '@/lib/hive/client-functions';

interface FeedApiItem {
  source: 'snap' | 'wave';
  author: string;
  permlink: string;
  created: string;
  parentAuthor: string;
  parentPermlink: string;
  body?: string;
  json_metadata?: string;
  active_votes?: ExtendedComment['active_votes'];
  children?: number;
}

interface UseBlendedFeedProps {
  username?: string;
  /** When false, this hook does no fetching — used when the blended source
   *  isn't the active one right now (a different filter is selected, or the
   *  feature flag is off). Defaults to true for standalone use. */
  enabled?: boolean;
}

function toExtendedComment(item: FeedApiItem): ExtendedComment {
  return {
    ...item,
    parent_author: item.parentAuthor,
    parent_permlink: item.parentPermlink,
  } as unknown as ExtendedComment;
}

/**
 * Blended snaps+waves feed. Unlike useSnaps, this does no container-walking or
 * client-side filtering — the sidecar already walked both containers, merged
 * them by timestamp, and hands back ready-to-render pages. See
 * internal-docs/hive-activity-sidecar-feed.md for the server-side design.
 */
export const useBlendedFeed = ({ username, enabled = true }: UseBlendedFeedProps = {}) => {
  const { settings } = useUserSettings();
  // Same value-compared key as useSnaps. Settings hydrate from localStorage
  // after mount (mutedTags starts []), and a mute added later must reset
  // Latest instead of leaving the first page unfiltered.
  const mutedTagsKey = settings.mutedTags.join(',');
  const lastCreatedRef = useRef<string | null>(null);
  const fetchedPermlinksRef = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);
  const isThrottledRef = useRef(false);
  // Same "generation" guard as useSnaps — a stale fetch (e.g. from a fast
  // tab-switch away and back) must not clobber results from a newer one.
  const fetchGenerationRef = useRef(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [comments, setComments] = useState<ExtendedComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  // currentPage alone doesn't change on a same-page refresh() call — this
  // forces the fetch effect to re-run regardless, same pattern as useSnaps.
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // 30, up from 20: with the virtualized SnapList, a fast mobile doomscroll
  // can reach the bottom of a loaded page before the next fetch lands,
  // which reads as the feed stalling. A bigger page is cheap runway — the
  // sidecar hands back pre-merged pages, so the marginal cost is small,
  // and virtualization means the extra items don't stay mounted anyway.
  const pageSize = 30;

  async function getMoreFeedItems(isCancelled: () => boolean): Promise<{ comments: ExtendedComment[]; hasMoreData: boolean }> {
    const qs = new URLSearchParams({ limit: String(pageSize) });
    if (lastCreatedRef.current) qs.set('before', lastCreatedRef.current);

    const res = await fetch(`/api/feed?${qs.toString()}`);
    const data: { items: FeedApiItem[]; hasMore: boolean } = await res.json();

    if (isCancelled()) return { comments: [], hasMoreData: data.hasMore };

    const mutedList = await mutedAccountsManager.getMutedList(username);
    // The reset effect clears lastCreatedRef / fetchedPermlinksRef when
    // username or muted tags change. A fetch that started earlier can
    // resume here and write those refs back, which paginates the new feed
    // from the stale page. Discard before touching either ref. The caller
    // still drops the returned comments when this generation is stale.
    if (isCancelled()) return { comments: [], hasMoreData: data.hasMore };

    const items = data.items
      .filter(item => !fetchedPermlinksRef.current.has(item.permlink))
      .filter(item => !mutedList.has(item.author.toLowerCase()))
      .filter(item => !hasMutedTag(item.json_metadata, settings.mutedTags));

    for (const item of items) {
      fetchedPermlinksRef.current.add(item.permlink);
      lastCreatedRef.current = item.created;
    }

    return { comments: items.map(toExtendedComment), hasMoreData: data.hasMore };
  }

  useEffect(() => {
    if (!enabled) return;

    const fetchPosts = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      const myGeneration = ++fetchGenerationRef.current;
      setIsLoading(true);
      const isStale = () => fetchGenerationRef.current !== myGeneration;
      try {
        const { comments: newItems, hasMoreData } = await getMoreFeedItems(isStale);
        if (isStale()) return;

        setHasMore(hasMoreData);
        setComments(prev => {
          const existing = new Set(prev.map(c => c.permlink));
          const unique = newItems.filter(c => !existing.has(c.permlink));
          return [...prev, ...unique];
        });
      } catch (err) {
        if (!isStale()) console.error('Error fetching blended feed:', err);
      } finally {
        if (!isStale()) {
          setIsLoading(false);
          setHasFetchedOnce(true);
          isFetchingRef.current = false;
        }
      }
    };

    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, fetchTrigger, enabled]);

  // Username is a fetch input: a list loaded before login resolved only
  // applied community mutes. Reset the cursor the same way useSnaps does
  // when the signed-in account or the muted-tag key changes. Bump the
  // generation immediately so a page fetched with the previous (often
  // still-empty) mute list cannot land after this reset and stick.
  useEffect(() => {
    fetchGenerationRef.current += 1;
    lastCreatedRef.current = null;
    fetchedPermlinksRef.current.clear();
    isFetchingRef.current = false;
    setComments([]);
    setHasMore(true);
    setHasFetchedOnce(false);
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  }, [username, mutedTagsKey]);

  useEffect(() => {
    return mutedAccountsManager.subscribePersonalMute((author) => {
      const target = author.toLowerCase();
      setComments(prev => prev.filter(c => c.author.toLowerCase() !== target));
    });
  }, []);

  const loadNextPage = useCallback(() => {
    if (isLoading || !hasMore || isThrottledRef.current) return;
    isThrottledRef.current = true;
    setCurrentPage(prev => prev + 1);
    setTimeout(() => { isThrottledRef.current = false; }, 1000);
  }, [isLoading, hasMore]);

  const refresh = () => {
    lastCreatedRef.current = null;
    fetchedPermlinksRef.current.clear();
    isFetchingRef.current = false;
    setComments([]);
    setHasMore(true);
    setHasFetchedOnce(false);
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  // Same helper as useSnaps.ts/useProfileSnaps.ts, same reason: an item
  // handed back by the sidecar is never refetched once it's in `comments`,
  // so its vote/payout data goes stale the moment anyone votes on it after
  // the fact. `get_content` works the same for a 'wave' item as a 'snap'
  // one — both are just a Hive author/permlink pair underneath the app's
  // own source-type label.
  const refreshComment = useCallback(async (author: string, permlink: string) => {
    try {
      const fresh = await getPost(author, permlink);
      setComments(prev => prev.map(c =>
        c.author === author && c.permlink === permlink
          ? {
              ...c,
              active_votes: fresh.active_votes,
              pending_payout_value: fresh.pending_payout_value,
              total_payout_value: fresh.total_payout_value,
              curator_payout_value: fresh.curator_payout_value,
              net_rshares: fresh.net_rshares,
            }
          : c
      ));
    } catch {
      // Leave the optimistic value in place on failure.
    }
  }, []);

  return { comments, isLoading, loadNextPage, hasMore, hasFetchedOnce, refresh, refreshComment };
};
