import HiveClient from '@/lib/hive/hiveclient';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ExtendedComment } from './useComments';
import { getFollowing } from '@/lib/hive/client-functions';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { usePatronStatus } from './usePatronStatus';

interface lastContainerInfo {
  permlink: string;
  date: string;
}

export type SnapFilterType = 'community' | 'all' | 'following' | 'patrons';

interface UseSnapsProps {
  filterType?: SnapFilterType;
  username?: string; // Required when filterType is 'following'
}

export const useSnaps = ({ filterType = 'community', username }: UseSnapsProps = {}) => {
  const lastContainerRef = useRef<lastContainerInfo | null>(null);
  const fetchedPermlinksRef = useRef<Set<string>>(new Set());
  const followingListRef = useRef<string[]>([]);
  const isFetchingRef = useRef(false);
  const isThrottledRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [comments, setComments] = useState<ExtendedComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [followingListLoaded, setFollowingListLoaded] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const pageMinSize = 10;
  // Safety cap on how many snap containers a single fetch will scan looking
  // for matches. Without this, a sparse filter (few/no patrons, or following
  // very few accounts) would walk the entire snap history one container at a
  // time looking for pageMinSize matches — many sequential RPC round-trips
  // that can hang the UI and hammer the node for nothing. Capping means a
  // single fetch may come back with fewer than pageMinSize results (or zero)
  // even though more (unscanned) history exists — see hasMoreData below.
  const MAX_CONTAINERS_PER_FETCH = 30;

  // Patron accounts — no community-tag restriction on this filter, since the
  // whole point of the tab is maximizing visibility for supporters.
  const { byAccount: patronAccounts, isLoading: patronsLoading } = usePatronStatus();

  // Load following list once when needed
  useEffect(() => {
    const loadFollowingList = async () => {
      if (filterType === 'following' && username) {
        if (followingListRef.current.length === 0) {
          setFollowingListLoaded(false);
          try {
            const following = await getFollowing(username, '', 1000);
            followingListRef.current = following;
            setFollowingListLoaded(true);
            setFetchTrigger(prev => prev + 1); // Trigger fetch once list is loaded
          } catch (error) {
            console.error('Error loading following list:', error);
            setFollowingListLoaded(true); // Set to true even on error to prevent infinite loading
            setFetchTrigger(prev => prev + 1); // Trigger fetch anyway
          }
        } else {
          setFollowingListLoaded(true);
          setFetchTrigger(prev => prev + 1); // Trigger fetch since list already loaded
        }
      }
    };
    loadFollowingList();
  }, [filterType, username]);

  // Filter comments by the target tag
  function filterCommentsByTag(comments: ExtendedComment[], targetTag: string): ExtendedComment[] {
    return comments.filter((commentItem) => {
      try {
        if (!commentItem.json_metadata) {
          return false; // Skip if json_metadata is empty
        }
        const metadata = JSON.parse(commentItem.json_metadata);
        const tags = metadata.tags || [];
        return tags.includes(targetTag);
      } catch (error) {
        console.error('Error parsing JSON metadata for comment:', commentItem, error);
        return false; // Exclude comments with invalid JSON
      }
    });
  }

  // Filter comments by following
  function filterCommentsByFollowing(comments: ExtendedComment[]): ExtendedComment[] {
    return comments.filter((commentItem) =>
      followingListRef.current.includes(commentItem.author)
    );
  }

  // Filter comments by patron status (any tier) — deliberately ignores the
  // community tag so a patron's snap shows up here regardless of where else
  // it appears.
  function filterCommentsByPatrons(comments: ExtendedComment[]): ExtendedComment[] {
    return comments.filter((commentItem) => patronAccounts.has(commentItem.author));
  }

  // Fetch comments with a minimum size. Returns hasMoreData separately from
  // the comments found — with the scan cap below, a fetch can legitimately
  // return fewer than pageMinSize (even zero) while more unscanned history
  // still remains, so callers can't infer "no more data" from result length
  // alone anymore.
  //
  // `isCancelled` lets a caller signal "the filter/page that started this
  // fetch is no longer the one being shown" (e.g. the user switched tabs
  // mid-scan). We check it at the top of every loop iteration so a stale
  // fetch stops dispatching new RPC calls almost immediately instead of
  // running to completion in the background, and we skip writing
  // lastContainerRef when cancelled so a stale fetch can never clobber the
  // pagination cursor a newer fetch is relying on.
  async function getMoreSnaps(isCancelled: () => boolean): Promise<{ comments: ExtendedComment[]; hasMoreData: boolean }> {
    const tag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || ''
    const author = "peak.snaps";
    const limit = 3;
    const allFilteredComments: ExtendedComment[] = [];

    let hasMoreData = true; // To track if there are more containers to fetch
    let containersScanned = 0;
    let permlink = lastContainerRef.current?.permlink || "";
    let date = lastContainerRef.current?.date || new Date().toISOString();

    // Fetch muted list once before the loop
    const mutedList = await mutedAccountsManager.getMutedList(username);

    while (allFilteredComments.length < pageMinSize && hasMoreData && containersScanned < MAX_CONTAINERS_PER_FETCH) {
      if (isCancelled()) break;

      const result = await HiveClient.database.call('get_discussions_by_author_before_date', [
        author,
        permlink,
        date,
        limit,
      ]);

      if (!result.length) {
        hasMoreData = false;
        break;
      }

      containersScanned += result.length;

      const allReplies = await Promise.all(
        result.map((resultItem: any) =>
          HiveClient.database.call("get_content_replies", [author, resultItem.permlink])
        )
      );

      for (let i = 0; i < result.length; i++) {
        const resultItem = result[i];
        const comments = allReplies[i] as ExtendedComment[];

        let filteredComments: ExtendedComment[] = [];

        if (filterType === 'community') {
          filteredComments = filterCommentsByTag(comments, tag);
        } else if (filterType === 'all') {
          filteredComments = comments;
        } else if (filterType === 'following') {
          filteredComments = filterCommentsByFollowing(comments);
        } else if (filterType === 'patrons') {
          filteredComments = filterCommentsByPatrons(comments);
        }

        filteredComments = filteredComments.filter(c => !mutedList.has(c.author.toLowerCase()));

        allFilteredComments.push(...filteredComments);

        fetchedPermlinksRef.current.add(resultItem.permlink);

        permlink = resultItem.permlink;
        date = resultItem.created;
      }
    }

    // Update the lastContainerRef state for the next API call — but not if
    // this fetch was cancelled, since a stale fetch's cursor position isn't
    // valid for whatever filter/page is current now.
    if (!isCancelled()) {
      lastContainerRef.current = { permlink, date };
    }

    return { comments: allFilteredComments, hasMoreData };
  }

  // Reset when filter changes
  useEffect(() => {
    lastContainerRef.current = null;
    fetchedPermlinksRef.current.clear();
    isFetchingRef.current = false;
    setComments([]);
    setHasMore(true);
    setHasFetchedOnce(false);
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  }, [filterType, username]);

  // Fetch posts when `currentPage` changes (or when followingListLoaded changes for following filter)
  useEffect(() => {
    // Only wait for following list if we're on the following filter
    if (filterType === 'following') {
      if (!followingListLoaded) {
        return; // Wait for following list to load
      }
    }
    // Same idea for the patrons filter — don't filter against an empty map
    // while the patron list is still loading.
    if (filterType === 'patrons' && patronsLoading) {
      return;
    }

    // Each run of this effect (one per filter switch / page / patrons-ready
    // transition) owns its own cancellation flag. If the filter or page
    // changes again before this fetch resolves, React calls this effect's
    // cleanup first, flipping `cancelled` to true — the in-flight scan stops
    // dispatching new requests within one loop iteration, and its results
    // are discarded instead of bleeding into whatever is now on screen.
    let cancelled = false;

    const fetchPosts = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      try {
        const { comments: newSnaps, hasMoreData } = await getMoreSnaps(() => cancelled);
        if (cancelled) return;

        setHasMore(hasMoreData);

        setComments((prevPosts) => {
          const existingPermlinks = new Set(prevPosts.map((post) => post.permlink));
          const uniqueSnaps = newSnaps.filter((snap) => !existingPermlinks.has(snap.permlink));
          return [...prevPosts, ...uniqueSnaps];
        });
      } catch (err) {
        if (!cancelled) console.error('Error fetching posts:', err);
      } finally {
        // A cancelled fetch doesn't own the lock anymore (the reset effect
        // already force-cleared it for the fetch that superseded this one) —
        // only the fetch that's still current is allowed to release it.
        if (!cancelled) {
          setIsLoading(false);
          setHasFetchedOnce(true);
          isFetchingRef.current = false;
        }
      }
    };

    fetchPosts();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, fetchTrigger, patronsLoading]);

  // Load the next page with throttling — ref-based so the flag survives re-renders
  const loadNextPage = useCallback(() => {
    if (isLoading || !hasMore || isThrottledRef.current) return;
    isThrottledRef.current = true;
    setCurrentPage((prevPage) => prevPage + 1);
    setTimeout(() => { isThrottledRef.current = false; }, 1000);
  }, [isLoading, hasMore]);

  const refresh = () => {
    lastContainerRef.current = null;
    fetchedPermlinksRef.current.clear();
    isFetchingRef.current = false;
    setComments([]);
    setHasMore(true);
    setHasFetchedOnce(false);
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  return { comments, isLoading, loadNextPage, hasMore, hasFetchedOnce, currentPage, refresh };
};
