'use client';
import { Box, Flex, Text, Spinner, Divider } from '@chakra-ui/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Discussion } from '@hiveio/dhive';
import { findPosts, getCommunityInfo } from '@/lib/hive/client-functions';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { useHiveUser } from '@/contexts/UserContext';
import PostInfiniteScroll from '@/components/blog/PostInfiniteScroll';
import SidebarEventsWidget from '@/components/hangouts/SidebarEventsWidget';
import TrendingMarketsWidget from '@/components/layout/TrendingMarketsWidget';
import ContainerVoteWidget from '@/components/layout/ContainerVoteWidget';
import WhoToFollowWidget from '@/components/layout/WhoToFollowWidget';
import { Divider as ChakraDivider } from '@chakra-ui/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserSettings } from '@/hooks/useUserSettings';
import { isDiscoveryEnabledFor } from '@/lib/discovery/config';
import { interleaveCandidates } from '@/lib/discovery/interleave';

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
  const { username } = useCurrentUser();
  const { settings } = useUserSettings();
  const [query] = useState('created');
  const [allPosts, setAllPosts] = useState<Discussion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mutedLoaded, setMutedLoaded] = useState(false);
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [blendCandidates, setBlendCandidates] = useState<Discussion[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);
  const mutedSetRef = useRef<Set<string>>(new Set());
  const hasInterleavedRef = useRef(false);
  // Persistent memory of every post ever added to allPosts, from ANY source
  // (the base chronological walk's own multi-page loop, later scroll-
  // triggered fetches, or the interleaved Trending/For You candidates).
  // Without this, a candidate spliced in early could get re-appended later
  // when the base's own cursor naturally walks past that same post — this
  // is exactly what caused a real duplicate-post bug (confirmed live).
  const seenKeysRef = useRef<Set<string>>(new Set());

  const tag = process.env.NEXT_PUBLIC_HIVE_SEARCH_TAG;
  const interestTagsKey = settings.interestTags.join(',');

  function postKey(post: Discussion): string {
    return `${post.author}/${post.permlink}`;
  }

  const params = useRef({
    tag,
    limit: 8,
    start_author: '',
    start_permlink: '',
  });

  // Blended Long Reads — Trending (genuine Hive trending-sort scoped to the
  // Snapie community tag, ungated, every visitor gets this) + For You
  // (gated: allowlist + interestTags picked, see lib/discovery/config.ts).
  // Both are small, one-time fetches on mount, merged and deduped, then
  // spliced once into the chronological base below (see the interleave
  // effect) — not refetched/re-interleaved as the base grows, since the
  // blend only needs to hold for the first screenful.
  useEffect(() => {
    if (!mutedLoaded) return; // wait for the mute list this component already loads for the base fetch

    let cancelled = false;

    async function loadBlendCandidates() {
      const trendingPromise: Promise<Discussion[]> = tag
        ? findPosts('trending', { tag, limit: 4 }).catch(() => [])
        : Promise.resolve([]);

      const showForYou = isDiscoveryEnabledFor(username) && settings.interestTags.length > 0;
      // blog-foryou already applies community + personal mutes server-side
      // (via the username param) — findPosts('trending', ...) is a raw Hive
      // call with no mute filtering at all, so that side is filtered below
      // against the same mutedSetRef the base chronological fetch already uses.
      const forYouPromise: Promise<Discussion[]> = showForYou
        ? fetch(`/api/discovery/blog-foryou?limit=4&tags=${encodeURIComponent(settings.interestTags.join(','))}&username=${encodeURIComponent(username!)}`, { cache: 'no-store' })
            .then(res => res.json())
            .then(data => (Array.isArray(data.items) ? data.items as Discussion[] : []))
            .catch(() => [])
        : Promise.resolve([]);

      const [trending, forYou] = await Promise.all([trendingPromise, forYouPromise]);
      if (cancelled) return;

      const seen = new Set<string>();
      const merged: Discussion[] = [];
      for (const post of [...trending, ...forYou]) {
        const key = `${post.author}/${post.permlink}`;
        const isMuted = mutedSetRef.current.has((post.author || '').toLowerCase());
        if (seen.has(key) || !post.author || post.parent_author || isMuted) continue;
        seen.add(key);
        merged.push(post);
      }
      setBlendCandidates(merged);
    }

    loadBlendCandidates();
    return () => { cancelled = true; };
  }, [tag, username, interestTagsKey, mutedLoaded]);

  // Splices blendCandidates into the chronological base exactly once, as
  // soon as both the base's first page and the candidates are ready —
  // guarded so later infinite-scroll pages append as plain chronological
  // Community, never re-shuffled (interleaveCandidates never cycles back
  // through exhausted candidates anyway, but this guard also avoids
  // redundant re-interleave work on every subsequent fetch).
  useEffect(() => {
    if (hasInterleavedRef.current) return;
    if (allPosts.length === 0 || blendCandidates.length === 0) return;
    hasInterleavedRef.current = true;
    // Register every candidate here — including ones interleaveCandidates
    // decides NOT to splice in because they're already in the base — so a
    // later base fetch can never re-add any of them either.
    blendCandidates.forEach(post => seenKeysRef.current.add(postKey(post)));
    setAllPosts(prev => interleaveCandidates(prev, blendCandidates, 2));
  }, [allPosts.length, blendCandidates]);

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

        // seenKeysRef dedupes against EVERY post ever added so far — from
        // this same loop's earlier iterations, from prior fetchPosts() calls
        // (scroll-triggered pagination), and from interleaved Trending/For
        // You candidates. Hive's cursor pagination can also legitimately
        // re-return the start_author/start_permlink post as the first item
        // of the next page, which this same check also catches.
        const topLevelPosts = posts.filter((post: Discussion) => {
          const isTopLevel = !post.parent_author;
          const isMuted = mutedSetRef.current.has(post.author.toLowerCase());
          const isDuplicate = seenKeysRef.current.has(postKey(post));
          return isTopLevel && !isMuted && !isDuplicate;
        });
        topLevelPosts.forEach((post: Discussion) => seenKeysRef.current.add(postKey(post)));

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
    seenKeysRef.current.clear();
    hasInterleavedRef.current = false;
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
      bg="surface"
      borderLeft="1px solid"
      borderLeftColor="surfaceBorder"
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
              <Text fontSize="xl" fontWeight="bold" color="text" letterSpacing="-0.03em">
                {communityStats.numPending}
              </Text>
              <Text fontSize="xs" color="overlay.500" mt="1px">live posts</Text>
            </Box>
            <Box w="1px" bg="rgba(28, 161, 241, 0.08)" alignSelf="stretch" />
            <Box textAlign="center">
              <Text fontSize="xl" fontWeight="bold" color="text" letterSpacing="-0.03em">
                ${communityStats.sumPending.toFixed(2)}
              </Text>
              <Text fontSize="xs" color="overlay.500" mt="1px">pending HBD</Text>
            </Box>
          </Flex>
          <Divider borderColor="rgba(28, 161, 241, 0.08)" mb={2} />
        </>
      )}

      <ContainerVoteWidget />

      <WhoToFollowWidget engagedAuthors={engagedAuthors} />

      <SidebarEventsWidget />

      <TrendingMarketsWidget />

      <Box px={2}>
        <Text
          fontSize="xs"
          fontWeight="bold"
          color="overlay.400"
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
