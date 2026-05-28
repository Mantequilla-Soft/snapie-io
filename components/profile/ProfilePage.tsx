'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Heading, Text, Spinner, Alert, AlertIcon, Image, Container,
  Flex, Icon, Avatar, Tabs, TabList, Tab, TabPanels, TabPanel,
} from '@chakra-ui/react';
import { Comment } from '@hiveio/dhive';
import useHiveAccount from '@/hooks/useHiveAccount';
import { FaGlobe } from 'react-icons/fa';
import { getProfile, findPosts } from '@/lib/hive/client-functions';
import PostGrid from '../blog/PostGrid';
import InfiniteScroll from 'react-infinite-scroll-component';
import UserActionButtons from './UserActionButtons';
import FollowersModal from './FollowersModal';
import SnapList from '@/components/homepage/SnapList';
import Conversation from '@/components/homepage/Conversation';
import SnapReplyModal from '@/components/homepage/SnapReplyModal';
import { useAioha } from '@aioha/react-ui';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import { useProfileSnaps } from '@/hooks/useProfileSnaps';
import { ExtendedComment } from '@/hooks/useComments';

interface ProfilePageProps {
  username: string;
}

export default function ProfilePage({ username }: ProfilePageProps) {
  const { user } = useAioha();
  const { hiveAccount, isLoading, error } = useHiveAccount(username);
  const [profileMetadata, setProfileMetadata] = useState<{ profileImage: string; coverImage: string; website: string }>({
    profileImage: '',
    coverImage: '',
    website: '',
  });
  const [profileInfo, setProfileInfo] = useState<any>(null);

  // Posts tab state
  const [posts, setPosts] = useState<any[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const isFetching = useRef(false);
  const tag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;
  const params = useRef({
    author: username,
    start_permlink: '',
    before_date: new Date().toISOString().split('.')[0],
    limit: 12,
  });

  // Followers modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'followers' | 'following'>('followers');

  // Snaps tab state
  const profileSnaps = useProfileSnaps(username);
  const [conversation, setConversation] = useState<Comment | undefined>();
  const [reply, setReply] = useState<ExtendedComment | undefined>();
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [conversationRefreshTrigger, setConversationRefreshTrigger] = useState(0);

  async function fetchPosts() {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoadingPosts(true);
    try {
      const newPosts = await findPosts('author_before_date', params.current);
      if (newPosts.length > 0) {
        setPosts(prev => [...prev, ...newPosts]);
        params.current = {
          author: username,
          start_permlink: newPosts[newPosts.length - 1].permlink,
          before_date: newPosts[newPosts.length - 1].created,
          limit: 12,
        };
        if (newPosts.length < params.current.limit) setHasMorePosts(false);
      } else {
        setHasMorePosts(false);
      }
    } catch (err) {
      console.error('Failed to fetch posts', err);
    } finally {
      isFetching.current = false;
      setIsLoadingPosts(false);
    }
  }

  // Reset posts when username changes
  useEffect(() => {
    setPosts([]);
    setHasMorePosts(true);
    isFetching.current = false;
    params.current = {
      author: username,
      start_permlink: '',
      before_date: new Date().toISOString().split('.')[0],
      limit: 12,
    };
  }, [username]);

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    if (hiveAccount?.json_metadata) {
      try {
        const parsedMetadata = JSON.parse(hiveAccount.posting_json_metadata);
        const profile = parsedMetadata?.profile || {};
        setProfileMetadata({
          profileImage: profile.profile_image || '',
          coverImage: profile.cover_image || '',
          website: profile.website || '',
        });
      } catch (err) {
        console.error('Failed to parse profile metadata', err);
      }
    }
  }, [hiveAccount]);

  useEffect(() => {
    const fetchProfileInfo = async () => {
      try {
        const profileData = await getProfile(username);
        setProfileInfo(profileData);
      } catch (err) {
        console.error('Failed to fetch profile info', err);
      }
    };
    if (username) fetchProfileInfo();
  }, [username]);

  const followers = profileInfo?.stats?.followers || 0;
  const following = profileInfo?.stats?.following || 0;
  const location = profileInfo?.metadata?.profile?.location || '';
  const about = profileInfo?.metadata?.profile?.about || '';

  const handleSnapReply = () => {
    setTimeout(() => {
      profileSnaps.refresh?.();
      setConversationRefreshTrigger(t => t + 1);
    }, 3000);
  };

  if (isLoading || !hiveAccount) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Spinner size="xl" color="primary" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Alert status="error" borderRadius="md" variant="solid">
          <AlertIcon />
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box color="text" maxW="container.lg" mx="auto">
      {/* Cover image */}
      <Box position="relative" height="200px">
        <Container id="cover" maxW="container.lg" p={0} overflow="hidden" position="relative" height="100%">
          <Image
            src={profileMetadata.coverImage}
            alt={`${hiveAccount?.name} cover`}
            width="100%"
            height="100%"
            objectFit="cover"
            mb={4}
            fallback={<div></div>}
          />
        </Container>
      </Box>

      {/* Profile header */}
      <Flex position="relative" mt={-16} p={4} alignItems="center" boxShadow="lg" justifyContent="space-between">
        <Box position="absolute" top={0} left={0} right={0} bottom={0} bg="muted" opacity={0.85} zIndex={1} />

        <Flex alignItems="center" zIndex={2} position="relative">
          <Avatar
            src={getHiveAvatarUrl(username, 'large')}
            name={hiveAccount?.name}
            borderRadius="full"
            boxSize="100px"
            mr={4}
          />
          <Box>
            <Flex alignItems="center">
              <Heading as="h2" size="lg" color="primary" mr={2}>
                {profileInfo?.metadata?.profile?.name || username}
              </Heading>
              <Box display="flex" alignItems="center" justifyContent="center" width="15px" height="15px" bg="gray.200" fontWeight="bold" fontSize="xs">
                {profileInfo?.reputation ? Math.round(profileInfo.reputation) : 0}
              </Box>
            </Flex>

            <Text fontSize="xs" color="text">
              <Text
                as="span"
                cursor="pointer"
                _hover={{ textDecoration: 'underline', color: 'primary' }}
                onClick={() => { setModalType('following'); setModalOpen(true); }}
              >
                Following: {following}
              </Text>
              {' | '}
              <Text
                as="span"
                cursor="pointer"
                _hover={{ textDecoration: 'underline', color: 'primary' }}
                onClick={() => { setModalType('followers'); setModalOpen(true); }}
              >
                Followers: {followers}
              </Text>
              {' | '}
              Location: {location}
              <br />
              {about}
            </Text>

            {profileMetadata.website && (
              <Flex alignItems="center">
                <Icon as={FaGlobe} w={2} h={2} onClick={() => window.open(profileMetadata.website, '_blank')} style={{ cursor: 'pointer' }} />
                <Text ml={2} fontSize="xs" color="primary">{profileMetadata.website}</Text>
              </Flex>
            )}
          </Box>
        </Flex>

        <Box zIndex={2} position="relative">
          <UserActionButtons targetUsername={username} currentUsername={user || null} />
        </Box>
      </Flex>

      {/* Tabs */}
      <Container maxW="container.lg" mt={4} px={0}>
        <Tabs defaultIndex={0} colorScheme="blue" isLazy>
          <TabList px={4}>
            <Tab>Snaps</Tab>
            <Tab>Posts</Tab>
          </TabList>

          <TabPanels>
            {/* Snaps tab */}
            <TabPanel px={0} pt={2}>
              {conversation ? (
                <Conversation
                  comment={conversation}
                  setConversation={setConversation}
                  onOpen={() => setIsReplyOpen(true)}
                  setReply={(c) => setReply(c as ExtendedComment)}
                  refreshTrigger={conversationRefreshTrigger}
                />
              ) : (
                <SnapList
                  author="peak.snaps"
                  permlink="snaps"
                  setConversation={setConversation}
                  onOpen={() => setIsReplyOpen(true)}
                  setReply={(c) => setReply(c as ExtendedComment)}
                  post={true}
                  data={profileSnaps}
                />
              )}
            </TabPanel>

            {/* Posts tab */}
            <TabPanel px={0}>
              {!isLoadingPosts && posts.length === 0 && !hasMorePosts && (
                <Box textAlign="center" mt={8} color="gray.500">
                  <Text fontSize="lg">No posts yet.</Text>
                </Box>
              )}
              <InfiniteScroll
                dataLength={posts.length}
                next={fetchPosts}
                hasMore={hasMorePosts}
                scrollableTarget="scrollableDiv"
                loader={
                  <Box display="flex" justifyContent="center" alignItems="center" py={8}>
                    <Spinner size="xl" color="primary" />
                  </Box>
                }
              >
                {posts && <PostGrid posts={posts} columns={3} />}
              </InfiniteScroll>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Container>

      <FollowersModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        username={username}
        type={modalType}
      />

      {isReplyOpen && (
        <SnapReplyModal
          isOpen={isReplyOpen}
          onClose={() => setIsReplyOpen(false)}
          comment={reply}
          onNewReply={handleSnapReply}
        />
      )}
    </Box>
  );
}
