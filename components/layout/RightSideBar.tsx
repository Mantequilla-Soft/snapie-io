'use client';
import { Box, Spinner } from '@chakra-ui/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Discussion } from '@hiveio/dhive';
import { findPosts, getCommunityMutedAccounts } from '@/lib/hive/client-functions';
import PostInfiniteScroll from '@/components/blog/PostInfiniteScroll';

export default function RightSideBar() {
  const [query, setQuery] = useState('created');
  const [allPosts, setAllPosts] = useState<Discussion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mutedLoaded, setMutedLoaded] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);
  const mutedAccountsRef = useRef<string[]>([]);

  const tag = process.env.NEXT_PUBLIC_HIVE_SEARCH_TAG
  const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG

  const params = useRef({
    tag: tag,
    limit: 8,
    start_author: '',
    start_permlink: '',
  });

  const fetchPosts = useCallback(async () => {
    if (isFetching.current) return; // Prevent multiple fetches
    isFetching.current = true;
    setIsLoading(true); // Set loading state
    
    try {
      const MIN_POSTS_TO_SHOW = 8;
      let allFetchedPosts: Discussion[] = [];
      let attempts = 0;
      const MAX_ATTEMPTS = 5; // Prevent infinite loops
      
      // Keep fetching until we have enough valid posts or hit max attempts
      while (allFetchedPosts.length < MIN_POSTS_TO_SHOW && attempts < MAX_ATTEMPTS) {
        const posts = await findPosts(query, params.current);
        
        if (posts.length === 0) break; // No more posts available
        
        // Filter out comments and muted accounts
        const topLevelPosts = posts.filter((post: Discussion) => {
          const isTopLevel = post.parent_author === '';
          const isMuted = mutedAccountsRef.current.includes(post.author);
          return isTopLevel && !isMuted;
        });
        
        allFetchedPosts = [...allFetchedPosts, ...topLevelPosts];
        
        // Update params to fetch next batch using the last post from API (not filtered)
        const lastPost = posts[posts.length - 1];
        params.current = {
          tag: tag,
          limit: 8,
          start_author: lastPost?.author || '',
          start_permlink: lastPost?.permlink || '',
        };
        
        attempts++;
      }
      
      setAllPosts((prevPosts) => [...prevPosts, ...allFetchedPosts]);
    } catch (error) {
      console.log(error);
    } finally {
      isFetching.current = false;
      setIsLoading(false); // Reset loading state
    }
  }, [query, tag]);

  // Fetch community muted accounts on mount
  useEffect(() => {
    const fetchMutedAccounts = async () => {
      if (communityTag) {
        const muted = await getCommunityMutedAccounts(communityTag);
        mutedAccountsRef.current = muted;
        setMutedLoaded(true);
      }
    };
    fetchMutedAccounts();
  }, [communityTag]);

  // Only fetch posts after muted accounts are loaded
  useEffect(() => {
    if (mutedLoaded) {
      fetchPosts();
    }
  }, [mutedLoaded, fetchPosts]);

  // Scroll event handler
  const handleScroll = useCallback(() => {
    const sidebar = sidebarRef.current;
    if (sidebar) {
      const { scrollTop, scrollHeight, clientHeight } = sidebar;
      const threshold = 400;
      if (scrollTop + clientHeight >= scrollHeight - threshold && !isLoading) {
        fetchPosts();
      }
    }
  }, [isLoading, fetchPosts]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (sidebar) {
      sidebar.addEventListener('scroll', handleScroll);
      return () => sidebar.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  return (
    <Box
      as="aside"
      display={{ base: 'none', md: 'block' }}
      w={{ base: '100%', md: '350px' }}
      h="100vh"
      overflowY="auto"
      pr={4}
      pl={2}
      pt={2}
      position={"sticky"}
      top={0}
      ref={sidebarRef}
      id="scrollableDiv"
      sx={
        {
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          scrollbarWidth: 'none',
        }
      }
    >
      <PostInfiniteScroll allPosts={allPosts} fetchPosts={fetchPosts} viewMode="list" />
    </Box>
  );
}
