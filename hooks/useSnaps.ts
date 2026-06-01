import HiveClient from '@/lib/hive/hiveclient';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ExtendedComment } from './useComments';
import { getFollowing } from '@/lib/hive/client-functions';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';

interface lastContainerInfo {
  permlink: string;
  date: string;
}

export type SnapFilterType = 'community' | 'all' | 'following';

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
  const [followingListLoaded, setFollowingListLoaded] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const pageMinSize = 10;
  
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

  // Fetch comments with a minimum size
  async function getMoreSnaps(): Promise<ExtendedComment[]> {
    const tag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || ''
    const author = "peak.snaps";
    const limit = 3;
    const allFilteredComments: ExtendedComment[] = [];

    let hasMoreData = true; // To track if there are more containers to fetch
    let permlink = lastContainerRef.current?.permlink || "";
    let date = lastContainerRef.current?.date || new Date().toISOString();

    // Fetch muted list once before the loop
    const mutedList = await mutedAccountsManager.getMutedList(username);

    while (allFilteredComments.length < pageMinSize && hasMoreData) {

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
        }

        filteredComments = filteredComments.filter(c => !mutedList.has(c.author.toLowerCase()));

        allFilteredComments.push(...filteredComments);

        fetchedPermlinksRef.current.add(resultItem.permlink);

        permlink = resultItem.permlink;
        date = resultItem.created;
      }
    }

    // Update the lastContainerRef state for the next API call
    lastContainerRef.current = { permlink, date };

    return allFilteredComments;
  }

  // Reset when filter changes
  useEffect(() => {
    lastContainerRef.current = null;
    fetchedPermlinksRef.current.clear();
    isFetchingRef.current = false;
    setComments([]);
    setHasMore(true);
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

    const fetchPosts = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      try {
        const newSnaps = await getMoreSnaps();

        if (newSnaps.length < pageMinSize) {
          setHasMore(false);
        }

        setComments((prevPosts) => {
          const existingPermlinks = new Set(prevPosts.map((post) => post.permlink));
          const uniqueSnaps = newSnaps.filter((snap) => !existingPermlinks.has(snap.permlink));
          return [...prevPosts, ...uniqueSnaps];
        });
      } catch (err) {
        console.error('Error fetching posts:', err);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    };

    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, fetchTrigger]);

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
    setCurrentPage(1);
    setFetchTrigger(prev => prev + 1);
  };

  return { comments, isLoading, loadNextPage, hasMore, currentPage, refresh };
};
