'use client';
import { Box, Flex, Text, Spinner, Divider } from '@chakra-ui/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Discussion } from '@hiveio/dhive';
import { findPosts, getCommunityInfo } from '@/lib/hive/client-functions';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { useHiveUser } from '@/contexts/UserContext';
import PostInfiniteScroll from '@/components/blog/PostInfiniteScroll';
import SidebarEventsWidget from '@/components/hangouts/SidebarEventsWidget';
import WhoToFollowWidget from '@/components/layout/WhoToFollowWidget';
import { Divider as ChakraDivider } from '@chakra-ui/react';

const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

interface CommunityStats {
  numPending: number;
  sumPending: number;
}

interface RightSideBarProps {
  /** Authors the current user has already engaged with in the currently
   *  loaded feed — passed through to WhoToFollowWidget to bias its
   *  suggestion ranking. Computed from data already in memory elsewhere;
   *  no extra fetches happen because of this prop. */
  engagedAuthors?: Set<string>;
}

export default function RightSideBar({ engagedAuthors }: RightSideBarProps = {}) {
  const { hiveUser } = useHiveUser();
  const [query] = useState('created');
  const [allPosts, setAllPosts] = useState<Discussion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mutedLoaded, setMutedLoaded] = useState(false);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);
  const mutedSetRef = useRef<Set<string>>(new Set());

  const tag = process.env.NEXT_PUBLIC_HIVE_SEARCH_TAG;

  const params = useRef({
    tag,
    limit: 8,
    start_author: '',
    start_permlink: '',
  });

  // Fetch community stats (live posts + pending payouts)
  useEffect(() => {
    if (!communityTag) return;
    getCommunityInfo(communityTag)
      .then(info => {
        if (info) {
          setCommunityStats({
            numPending: info.num_pending ?? 0,
            sumPending: typeof info.sum_pending === 'number' ? info.sum_pending : 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const fetchPosts = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);

    try {
      const MIN_POSTS_TO_SHOW = 8;
      let allFetchedPosts: Discussion[] = [];
      let attempts = 0;
      const MAX_ATTEMPTS = 5;

      while (allFetchedPosts.length < MIN_POSTS_TO_SHOW && attempts < MAX_ATTEMPTS) {
        const posts = await findPosts(query, params.current);
        if (posts.length === 0) break;

        const topLevelPosts = posts.filter((post: Discussion) => {
          const isTopLevel = !post.parent_author;
          const isMuted = mutedSetRef.current.has(post.author.toLowerCase());
          return isTopLevel && !isMuted;
        });

        allFetchedPosts = [...allFetchedPosts, ...topLevelPosts];

        const lastPost = posts[posts.length - 1];
        params.current = {
          tag,
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
      setIsLoading(false);
    }
  }, [query, tag]);

  useEffect(() => {
    setMutedLoaded(false);
    setAllPosts([]);
    params.current = { tag, limit: 8, start_author: '', start_permlink: '' };
    mutedAccountsManager.getMutedList(hiveUser?.name).then(mutedSet => {
      mutedSetRef.current = mutedSet;
      setMutedLoaded(true);
    });
  }, [hiveUser?.name, tag]);

  useEffect(() => {
    if (mutedLoaded) fetchPosts();
  }, [mutedLoaded, fetchPosts]);

  const handleScroll = useCallback(() => {
    const sidebar = sidebarRef.current;
    if (sidebar) {
      const { scrollTop, scrollHeight, clientHeight } = sidebar;
      if (scrollTop + clientHeight >= scrollHeight - 400 && !isLoading) {
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
      w={{ base: '100%', md: '300px' }}
      h="100vh"
      overflowY="auto"
      position="sticky"
      top={0}
      bg="rgba(8, 24, 40, 0.62)"
      borderLeft="1px solid rgba(28, 161, 241, 0.1)"
      borderRadius={0}
      backdropFilter="blur(18px)"
      ref={sidebarRef}
      id="scrollableDiv"
      sx={{
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {/* Community stats bar */}
      {communityStats !== null && (
        <>
          <Flex justify="space-around" px={3} pt={4} pb={3}>
            <Box textAlign="center">
              <Text fontSize="xl" fontWeight="bold" color="white" letterSpacing="-0.03em">
                {communityStats.numPending}
              </Text>
              <Text fontSize="xs" color="whiteAlpha.500" mt="1px">live posts</Text>
            </Box>
            <Box w="1px" bg="rgba(28, 161, 241, 0.08)" alignSelf="stretch" />
            <Box textAlign="center">
              <Text fontSize="xl" fontWeight="bold" color="white" letterSpacing="-0.03em">
                ${communityStats.sumPending.toFixed(2)}
              </Text>
              <Text fontSize="xs" color="whiteAlpha.500" mt="1px">pending HBD</Text>
            </Box>
          </Flex>
          <Divider borderColor="rgba(28, 161, 241, 0.08)" mb={2} />
        </>
      )}

      <WhoToFollowWidget engagedAuthors={engagedAuthors} />

      <SidebarEventsWidget />

      <Box px={2}>
        <Text
          fontSize="xs"
          fontWeight="bold"
          color="whiteAlpha.400"
          letterSpacing="widest"
          textTransform="uppercase"
          px={2}
          pt={2}
          pb={3}
        >
          Long Reads
        </Text>
        <PostInfiniteScroll allPosts={allPosts} fetchPosts={fetchPosts} viewMode="list" />
      </Box>
    </Box>
  );
}
