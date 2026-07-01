'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ExtendedComment } from './useComments';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

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

  const pageSize = 20;

  async function getMoreFeedItems(isCancelled: () => boolean): Promise<{ comments: ExtendedComment[]; hasMoreData: boolean }> {
    const qs = new URLSearchParams({ limit: String(pageSize) });
    if (lastCreatedRef.current) qs.set('before', lastCreatedRef.current);

    const res = await fetch(`/api/feed?${qs.toString()}`);
    const data: { items: FeedApiItem[]; hasMore: boolean } = await res.json();

    if (isCancelled()) return { comments: [], hasMoreData: data.hasMore };

    const mutedList = await mutedAccountsManager.getMutedList(username);
    const items = data.items
      .filter(item => !fetchedPermlinksRef.current.has(item.permlink))
      .filter(item => !mutedList.has(item.author.toLowerCase()));

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

  return { comments, isLoading, loadNextPage, hasMore, hasFetchedOnce, refresh };
};
