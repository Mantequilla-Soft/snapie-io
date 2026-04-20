'use client';

import { Box, Flex } from '@chakra-ui/react';
import SnapList from '@/components/homepage/SnapList';
import RightSidebar from '@/components/layout/RightSideBar';
import { useState, useEffect } from 'react';
import { Comment } from '@hiveio/dhive'; // Ensure this import is consistent
import Conversation from '@/components/homepage/Conversation';
import SnapReplyModal from '@/components/homepage/SnapReplyModal';
import { useSnaps, SnapFilterType } from '@/hooks/useSnaps';
import FeedTabFilter from '@/components/homepage/FeedTabFilter';
import { useAioha } from '@aioha/react-ui';
import { getCommunityInfo } from '@/lib/hive/client-functions';

interface CommunityInfo {
  title: string;
  about: string;
}

export default function Home() {
  //console.log('author', process.env.NEXT_PUBLIC_THREAD_AUTHOR);
  const thread_author = 'peak.snaps';
  const thread_permlink = 'snaps';
  const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

  const [conversation, setConversation] = useState<Comment | undefined>();
  const [reply, setReply] = useState<Comment>();
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState<Comment | null>(null); // Define the state
  const [activeFilter, setActiveFilter] = useState<SnapFilterType>('community');
  const [communityName, setCommunityName] = useState<string>('Community');

  const { user } = useAioha();

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

  const onOpen = () => setIsOpen(true);
  const onClose = () => setIsOpen(false);

  const handleNewComment = (newComment: Partial<Comment> | CharacterData) => {
    setNewComment(newComment as Comment);
  };

  const handleFilterChange = (filter: SnapFilterType) => {
    setActiveFilter(filter);
    setConversation(undefined); // Close conversation view when changing filter
  };

  const snaps = useSnaps({ 
    filterType: activeFilter, 
    username: user || undefined
  });

  return (
    <Flex direction={{ base: 'column', md: 'row' }}>
      <Box
        h="100vh"
        overflowY="auto"
        px={2}
        flex="1"
        sx={
          {
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            scrollbarWidth: 'none',
          }
        }
        id='scrollableDiv'>
        <FeedTabFilter 
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          communityName={communityName}
          isLoggedIn={!!user}
        />
        {!conversation ? (


          <SnapList
            author={thread_author}
            permlink={thread_permlink}
            setConversation={setConversation}
            onOpen={onOpen}
            setReply={setReply}
            newComment={newComment}
            data={{...snaps, refresh: snaps.refresh}}
          />
        ) : (
          <Conversation comment={conversation} setConversation={setConversation} onOpen={onOpen} setReply={setReply} />
        )}
      </Box>
      <RightSidebar />
      {isOpen && <SnapReplyModal isOpen={isOpen} onClose={onClose} comment={reply} onNewReply={handleNewComment} />}
    </Flex>
  );
}