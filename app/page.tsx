'use client';

import { Box, Flex } from '@chakra-ui/react';
import SnapList from '@/components/homepage/SnapList';
import RightSidebar from '@/components/layout/RightSideBar';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Comment } from '@hiveio/dhive'; // Ensure this import is consistent
import Conversation from '@/components/homepage/Conversation';
import SnapReplyModal from '@/components/homepage/SnapReplyModal';
import { useSnaps, SnapFilterType } from '@/hooks/useSnaps';
import FeedTabFilter from '@/components/homepage/FeedTabFilter';
import NewSnapsBanner from '@/components/homepage/NewSnapsBanner';
import { useNewSnapsAvailable } from '@/hooks/useNewSnapsAvailable';
import OpenPodsLiveStrip from '@/components/hangouts/OpenPodsLiveStrip';
import UpcomingEventsStrip from '@/components/hangouts/UpcomingEventsStrip';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getCommunityInfo } from '@/lib/hive/client-functions';
import { useSearchParams, useRouter } from 'next/navigation';

interface CommunityInfo {
  title: string;
  about: string;
}

export default function Home() {
  //console.log('author', process.env.NEXT_PUBLIC_THREAD_AUTHOR);
  const thread_author = 'peak.snaps';
  const thread_permlink = 'snaps';
  const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [conversation, setConversation] = useState<Comment | undefined>();
  const [reply, setReply] = useState<Comment>();
  const [isOpen, setIsOpen] = useState(false);
  const [conversationRefreshTrigger, setConversationRefreshTrigger] = useState(0);
  const [activeFilter, setActiveFilter] = useState<SnapFilterType>('community');
  const [communityName, setCommunityName] = useState<string>('Community');

  const { username: user, isLoggedIn } = useCurrentUser();

  useEffect(() => {
    const loadCommunityInfo = async () => {
      if (communityTag) {
        try {
          // Check sessionStorage first
          const cachedData = sessionStorage.getItem('communityData');
          if (cachedData) {
            const communityData = JSON.parse(cachedData) as CommunityInfo;
            setCommunityName(communityData.title);
          } else {
            // Fetch if not cached
            const communityData = await getCommunityInfo(communityTag);
            setCommunityName(communityData.title);
            sessionStorage.setItem('communityData', JSON.stringify(communityData));
          }
        } catch (error) {
          console.error('Failed to fetch community info', error);
        }
      }
    };

    loadCommunityInfo();
  }, [communityTag]);

  useEffect(() => {
    if (searchParams.get('focus') !== 'composer') return;
    router.replace('/');
    document.getElementById('scrollableDiv')?.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('#snap-composer textarea')?.focus();
    }, 400);
  }, [searchParams, router]);

  const onOpen = () => setIsOpen(true);
  const onClose = () => setIsOpen(false);

  const handleReply = (_partial: Partial<Comment>) => {
    setTimeout(() => {
      snaps.refresh?.();
      setConversationRefreshTrigger(t => t + 1);
    }, 3000);
  };

  const handleFilterChange = (filter: SnapFilterType) => {
    setActiveFilter(filter);
    setConversation(undefined); // Close conversation view when changing filter
    if (filter === 'all') acknowledge();
  };

  const snaps = useSnaps({
    filterType: activeFilter,
    username: user || undefined
  });

  const { newCount, acknowledge } = useNewSnapsAvailable();

  // Authors of snaps the current user has already upvoted in the currently
  // loaded feed — read from data already in memory for the feed itself, no
  // extra fetches. Passed down to bias the "Who to follow" widget's ranking.
  const engagedAuthors = useMemo(() => {
    const set = new Set<string>();
    if (!user) return set;
    for (const comment of snaps.comments) {
      if (comment.active_votes?.some(vote => vote.voter === user)) {
        set.add(comment.author);
      }
    }
    return set;
  }, [snaps.comments, user]);

  // Measure the sticky tab strip so the banner can dock just below it
  // (rather than overlapping) once both are pinned to the top while scrolling.
  const tabFilterRef = useRef<HTMLDivElement>(null);
  const [tabFilterHeight, setTabFilterHeight] = useState(0);

  useEffect(() => {
    const el = tabFilterRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setTabFilterHeight(el.offsetHeight));
    observer.observe(el);
    setTabFilterHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  const handleViewNewSnaps = () => {
    // A snap posted without the Snapie community tag never shows up under the
    // "For You" filter — jump to "Latest" so the new snap is guaranteed to be
    // visible. If already on "Latest", filterType won't change so it won't
    // auto-refetch — refresh explicitly in that case.
    if (activeFilter === 'all') {
      snaps.refresh?.();
    } else {
      handleFilterChange('all');
    }
    acknowledge();
    document.getElementById('scrollableDiv')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Flex direction={{ base: 'column', md: 'row' }} gap={{ base: 0, md: 4 }} px={{ base: 0, md: 4 }}>
      <Box
        h="100vh"
        overflowY="auto"
        px={{ base: 2, md: 3 }}
        flex="1"
        minW={0}
        sx={
          {
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            scrollbarWidth: 'none',
          }
        }
        id='scrollableDiv'>
        <OpenPodsLiveStrip />
        <UpcomingEventsStrip />
        <Box ref={tabFilterRef}>
          <FeedTabFilter
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            communityName={communityName}
            isLoggedIn={isLoggedIn}
          />
        </Box>
        {!conversation ? (
          <>
            <NewSnapsBanner count={newCount} onClick={handleViewNewSnaps} top={tabFilterHeight} />
            <SnapList
              author={thread_author}
              permlink={thread_permlink}
              setConversation={setConversation}
              onOpen={onOpen}
              setReply={setReply}
              data={{...snaps, refresh: snaps.refresh}}
              emptyMessage={activeFilter === 'patrons' ? 'No patrons yet — be the first to support Snapie!' : undefined}
            />
          </>
        ) : (
          <Conversation comment={conversation} setConversation={setConversation} onOpen={onOpen} setReply={setReply} refreshTrigger={conversationRefreshTrigger} />
        )}
      </Box>
      <RightSidebar engagedAuthors={engagedAuthors} />
      {isOpen && <SnapReplyModal isOpen={isOpen} onClose={onClose} comment={reply} onNewReply={handleReply} />}
    </Flex>
  );
}