'use client';

import { Box, Flex } from '@chakra-ui/react';
import SnapList from '@/components/homepage/SnapList';
import RightSidebar from '@/components/layout/RightSideBar';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Comment } from '@hiveio/dhive'; // Ensure this import is consistent
import Conversation from '@/components/homepage/Conversation';
import SnapReplyModal from '@/components/homepage/SnapReplyModal';
import { useSnaps, SnapFilterType } from '@/hooks/useSnaps';
import { useBlendedFeed } from '@/hooks/useBlendedFeed';
import FeedTabFilter from '@/components/homepage/FeedTabFilter';
import NewSnapsBanner from '@/components/homepage/NewSnapsBanner';
import { useNewSnapsAvailable } from '@/hooks/useNewSnapsAvailable';
import OpenPodsLiveStrip from '@/components/hangouts/OpenPodsLiveStrip';
import UpcomingEventsStrip from '@/components/hangouts/UpcomingEventsStrip';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getCommunityInfo } from '@/lib/hive/client-functions';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDiscoveryCandidates } from '@/hooks/useDiscoveryCandidates';
import { useTrendingFeed } from '@/hooks/useTrendingFeed';
import { useUserSettings } from '@/hooks/useUserSettings';
import { isDiscoveryEnabledFor, DISCOVERY_INTERLEAVE_EVERY_N } from '@/lib/discovery/config';

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
  const [activeFilter, setActiveFilter] = useState<SnapFilterType>('all');
  const [communityName, setCommunityName] = useState<string>('Community');

  const { username: user, isLoggedIn } = useCurrentUser();
  const { settings } = useUserSettings();

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
      activeFeedData.refresh?.();
      setConversationRefreshTrigger(t => t + 1);
    }, 3000);
  };

  const handleFilterChange = (filter: SnapFilterType) => {
    setActiveFilter(filter);
    setBlendedFailed(false); // retry the blended source fresh on every visit to "Latest"
    setConversation(undefined); // Close conversation view when changing filter
    if (filter === 'all') acknowledge();
  };

  // "Latest" blends snaps+waves via the sidecar's /feed endpoint when this flag
  // is on — see internal-docs/hive-activity-sidecar-feed.md. If the sidecar
  // isn't up yet (or hiccups), blendedFailed flips true and we fall back to
  // the plain snaps-only path below, so "Latest" never goes blank for visitors.
  const ENABLE_BLENDED_FEED = process.env.NEXT_PUBLIC_ENABLE_BLENDED_FEED === 'true';
  const [blendedFailed, setBlendedFailed] = useState(false);
  const showBlendedForAll = ENABLE_BLENDED_FEED && activeFilter === 'all' && !blendedFailed;

  // Discovery Engine Phase 1 — gated behind a flag + account allowlist (see
  // lib/discovery/config.ts), off for everyone else.
  const showTrendingTab = isDiscoveryEnabledFor(user);
  const isTrendingTab = activeFilter === 'trending';

  // Discovery Engine Phase 2 — "For You" 3-state design, gated to
  // allowlisted accounts (everyone else keeps today's exact
  // useSnaps('community') chronological behavior):
  //  - cold: no interest signal yet (never onboarded, or onboarded with
  //    nothing selected) — Snapie-community-scoped, engagement-ranked
  //    (fetchForYouSnapCandidates).
  //  - warm: has picked interest topics — cross-community, snaps+waves,
  //    ranked by interest-tag match + engagement (fetchWarmForYouCandidates).
  // An onboarded-but-empty-interestTags user (skipped onboarding) is treated
  // as cold — handing the warm pool an impossible "match nothing" request
  // would just waste a request for an empty result.
  const isColdStart = settings.interestsOnboardedAt === null || settings.interestTags.length === 0;
  const isForYouCold = showTrendingTab && activeFilter === 'community' && isColdStart;
  const isForYouWarm = showTrendingTab && activeFilter === 'community' && !isColdStart;
  const warmExtraQuery = `tags=${encodeURIComponent(settings.interestTags.join(','))}${user ? `&username=${encodeURIComponent(user)}` : ''}`;
  // Trending/cold-start For You share one cached pool across every visitor
  // (community mutes baked in) — this is how each request layers the
  // viewer's own personal mutes on top, same as the warm pool already does.
  const personalMuteQuery = user ? `username=${encodeURIComponent(user)}` : '';

  const snaps = useSnaps({
    filterType: activeFilter,
    username: user || undefined,
    skip: showBlendedForAll || isTrendingTab || isForYouCold || isForYouWarm, // covered by another source — don't duplicate the RPC walk
  });
  const blendedFeed = useBlendedFeed({
    username: user || undefined,
    enabled: ENABLE_BLENDED_FEED && activeFilter === 'all',
  });
  const trendingFeed = useTrendingFeed({ enabled: isTrendingTab, extraQuery: personalMuteQuery });
  const forYouColdFeed = useTrendingFeed({ enabled: isForYouCold, endpoint: '/api/discovery/foryou-candidates', extraQuery: personalMuteQuery });
  const forYouWarmFeed = useTrendingFeed({ enabled: isForYouWarm, endpoint: '/api/discovery/foryou-warm', extraQuery: warmExtraQuery });
  const activeFeedData = showBlendedForAll ? blendedFeed : isTrendingTab ? trendingFeed : isForYouWarm ? forYouWarmFeed : isForYouCold ? forYouColdFeed : snaps;

  // Interleaving into the normal feed only makes sense for 'all' — 'For You'
  // is now itself an engagement-ranked pool for allowlisted accounts (no
  // point interleaving trending items into a feed that's already trending-
  // ordered), and 'following'/'patrons' are relationship-curated by design.
  // The dedicated 'trending' tab already *is* this same pool, so splicing it
  // into itself would just be confusing duplication.
  const discoveryEnabled = showTrendingTab && activeFilter === 'all';
  const { candidates: discoveryItems } = useDiscoveryCandidates({ enabled: discoveryEnabled, username: user || undefined });

  // First-page probe: if the blended source comes back empty, fall back to
  // snaps-only for this session. Scoped to the first page only — a sidecar
  // outage is a launch-day/persistent condition worth guarding against; a
  // hiccup deep into scrolling is the same class of "ran out of results"
  // every filter's own scan cap can already legitimately produce.
  useEffect(() => {
    if (showBlendedForAll && blendedFeed.hasFetchedOnce && blendedFeed.comments.length === 0 && !blendedFeed.hasMore) {
      setBlendedFailed(true);
    }
  }, [showBlendedForAll, blendedFeed.hasFetchedOnce, blendedFeed.comments.length, blendedFeed.hasMore]);

  // Matches whatever "Latest" is actually showing right now — blended when
  // healthy, snap-only during the same fallback window the feed itself uses.
  const { newCount, acknowledge } = useNewSnapsAvailable({ source: showBlendedForAll ? 'blended' : 'snaps' });

  // Authors of snaps the current user has already upvoted in the currently
  // loaded feed — read from data already in memory for the feed itself, no
  // extra fetches. Passed down to bias the "Who to follow" widget's ranking.
  const engagedAuthors = useMemo(() => {
    const set = new Set<string>();
    if (!user) return set;
    for (const comment of activeFeedData.comments) {
      if (comment.active_votes?.some(vote => vote.voter === user)) {
        set.add(comment.author);
      }
    }
    return set;
  }, [activeFeedData.comments, user]);

  // Clicking the Home button while already on `/` dispatches this event so the
  // nav components (which live outside this component tree) can trigger a reset
  // without needing direct access to our state setters.
  useEffect(() => {
    const handler = () => {
      setActiveFilter('all');
      setConversation(undefined);
      document.getElementById('scrollableDiv')?.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('snapie:go-home', handler);
    return () => window.removeEventListener('snapie:go-home', handler);
  }, []);

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
      activeFeedData.refresh?.();
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
            showTrending={showTrendingTab}
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
              data={{...activeFeedData, refresh: activeFeedData.refresh}}
              emptyMessage={
                activeFilter === 'patrons' ? 'No patrons yet — be the first to support Snapie!' :
                isTrendingTab ? 'Nothing trending right now — check back soon.' :
                isForYouWarm ? 'Nothing matching your interests right now — check back soon.' :
                isForYouCold ? 'Nothing trending in the Snapie community right now — check back soon.' :
                showBlendedForAll ? 'No snaps or waves yet.' : undefined
              }
              discoveryItems={discoveryEnabled ? discoveryItems : undefined}
              discoveryEveryN={DISCOVERY_INTERLEAVE_EVERY_N}
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