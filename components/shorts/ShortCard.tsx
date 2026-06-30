'use client';
import {
  Box, Flex, Text, Image, VStack, HStack, IconButton, useToast,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
  Menu, MenuButton, MenuList, MenuItem, Spinner,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton,
  Avatar, Input,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { usePlayer } from '@mantequilla-soft/3speak-player/react';
import {
  FaHeart, FaRegHeart, FaComment, FaShare, FaPaperPlane,
  FaVolumeUp, FaVolumeMute, FaEllipsisH,
  FaUserPlus, FaUserMinus, FaVolumeMute as FaMuteUser,
} from 'react-icons/fa';
import { ShortItem } from '@/lib/shorts/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { vote, getPost } from '@/lib/hive/client-functions';
import { useUserRelationship } from '@/hooks/useUserRelationship';
import { useRouter } from 'next/navigation';
import { chatService, Conversation } from '@/lib/chat/ChatService';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── Video Player ─────────────────────────────────────────────────────────────

function ShortVideoPlayer({
  author,
  permlink,
  autoPlay,
  muted,
}: {
  author: string;
  permlink: string;
  autoPlay: boolean;
  muted: boolean;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const { ref: playerCallbackRef } = usePlayer({
    apiBase: 'https://play.3speak.tv',
    autoLoad: `${author}/${permlink}`,
    autoPlay,
    muted: true,
    poster: false,
    hlsConfig: {
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 30 * 1000 * 1000,
    },
  });

  const combinedRef = useCallback(
    (el: HTMLVideoElement | null) => {
      localRef.current = el;
      playerCallbackRef(el);
    },
    [playerCallbackRef],
  );

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    if (autoPlay) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [autoPlay]);

  // React's `muted` JSX prop is broken — mutate the DOM element directly.
  useEffect(() => {
    if (localRef.current) localRef.current.muted = muted;
  }, [muted]);

  return (
    <video
      ref={combinedRef}
      autoPlay={autoPlay}
      playsInline
      muted
      loop={autoPlay}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        background: '#000',
        opacity: autoPlay ? 1 : 0,
        pointerEvents: autoPlay ? 'auto' : 'none',
      }}
    />
  );
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────

interface ActionBtnProps {
  icon: React.ReactElement;
  label?: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
}

function ActionBtn({
  icon, label, count, active, activeColor = 'red.400',
  onClick, onPointerDown, onPointerUp, onPointerLeave,
}: ActionBtnProps) {
  return (
    <VStack spacing={1}>
      <IconButton
        aria-label={label || 'Action'}
        icon={icon}
        variant="ghost"
        color={active ? activeColor : 'white'}
        fontSize="24px"
        size="lg"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        bg="blackAlpha.500"
        _hover={{ bg: 'whiteAlpha.200', transform: 'scale(1.05)' }}
        _active={{ transform: 'scale(0.92)' }}
        borderRadius="full"
        boxSize="48px"
        minW="48px"
        transition="all 0.15s ease"
      />
      {count !== undefined && (
        <Text color="white" fontSize="xs" fontWeight="bold" lineHeight="1">
          {formatCount(count)}
        </Text>
      )}
    </VStack>
  );
}

// ─── ShortCard ────────────────────────────────────────────────────────────────

interface ShortCardProps {
  short: ShortItem;
  isActive: boolean;
  isPreload: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: () => void;
}

export default function ShortCard({ short, isActive, isPreload, muted, onToggleMute, onOpenComments }: ShortCardProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(short.stats.likes);
  const [showVoteSlider, setShowVoteSlider] = useState(false);
  const [voteWeight, setVoteWeight] = useState(100);
  const [isVoting, setIsVoting] = useState(false);
  const [showSendPicker, setShowSendPicker] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState('');
  const { username: user } = useCurrentUser();
  const toast = useToast();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const {
    isFollowing, isMuted: isAuthorMuted,
    isLoading: relationshipLoading, isProcessing: relationshipProcessing,
    fetchRelationship, handleFollow, handleMute: handleAuthorMute,
  } = useUserRelationship(short.author);

  // ── Vote detection: check active_votes when card first becomes active ────
  const checkedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLiked(false);
      checkedUserRef.current = null;
      return;
    }
    if (!isActive) return;
    if (checkedUserRef.current === user) return;
    checkedUserRef.current = user;

    getPost(short.author, short.hivePermlink)
      .then(post => {
        if ((post as any).active_votes?.some((v: any) => v.voter === user)) {
          setLiked(true);
        }
      })
      .catch(() => {});
  }, [isActive, user, short.author, short.hivePermlink]);

  // ── Quick like (tap = 100%) ───────────────────────────────────────────────

  const handleQuickLike = useCallback(async () => {
    if (!user) {
      toast({ title: 'Login to like', status: 'info', duration: 2000 });
      return;
    }
    if (liked) return;
    setShowVoteSlider(false);
    const prev = likeCount;
    setLiked(true);
    setLikeCount(p => p + 1);
    setIsVoting(true);
    try {
      const result = await vote({ username: user, author: short.author, permlink: short.hivePermlink, weight: 10000 });
      if (!result.success) {
        setLiked(false);
        setLikeCount(prev);
        toast({ title: 'Vote failed', status: 'error', duration: 2000 });
      } else {
        if (navigator.vibrate) navigator.vibrate(20);
      }
    } catch {
      setLiked(false);
      setLikeCount(prev);
    } finally {
      setIsVoting(false);
    }
  }, [user, liked, likeCount, short.author, short.hivePermlink, toast]);

  // ── Weighted vote (from slider) ───────────────────────────────────────────

  const handleWeightedVote = useCallback(async () => {
    if (!user || liked) return;
    setShowVoteSlider(false);
    const prev = likeCount;
    setLiked(true);
    setLikeCount(p => p + 1);
    setIsVoting(true);
    try {
      const result = await vote({ username: user, author: short.author, permlink: short.hivePermlink, weight: voteWeight * 100 });
      if (!result.success) {
        setLiked(false);
        setLikeCount(prev);
        toast({ title: 'Vote failed', status: 'error', duration: 2000 });
      }
    } catch {
      setLiked(false);
      setLikeCount(prev);
    } finally {
      setIsVoting(false);
    }
  }, [user, liked, likeCount, voteWeight, short.author, short.hivePermlink, toast]);

  // ── Long press → show weight slider ──────────────────────────────────────

  const handleLikePointerDown = () => {
    holdTimer.current = setTimeout(() => {
      if (user && !liked) setShowVoteSlider(true);
    }, 400);
  };
  const handleLikePointerUp = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  // ── Share ─────────────────────────────────────────────────────────────────

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/shorts?v=${short.author}/${short.hivePermlink}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: short.title || 'Check this out!', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(
        () => toast({ title: 'Link copied', status: 'success', duration: 2000 }),
        () => toast({ title: 'Copy failed', status: 'error', duration: 2000 }),
      );
    }
  }, [short.author, short.hivePermlink, short.title, toast]);

  // ── Send via chat ─────────────────────────────────────────────────────────

  const handleOpenSendPicker = useCallback(async () => {
    if (!user) {
      toast({ title: 'Login to send', status: 'info', duration: 2000 });
      return;
    }
    setConvSearch('');
    setShowSendPicker(true);
    if (conversations.length === 0) {
      setLoadingConvs(true);
      try {
        const convs = await chatService.getConversations();
        setConversations(convs);
      } catch {
        toast({ title: 'Could not load conversations', status: 'error', duration: 2000 });
      } finally {
        setLoadingConvs(false);
      }
    }
  }, [user, conversations.length, toast]);

  const filteredConvs = useMemo(() => {
    const q = convSearch.toLowerCase();
    return conversations.filter(c => {
      const name = c.type === 'dm' ? (c.peer ?? '') : c.name;
      return name.toLowerCase().includes(q);
    });
  }, [conversations, convSearch]);

  const handleSendToConversation = useCallback(async (conv: Conversation) => {
    if (sendingTo) return;
    setSendingTo(conv._id);
    const url = `${window.location.origin}/shorts?v=${short.author}/${short.hivePermlink}`;
    try {
      if (conv.type === 'channel') {
        await chatService.sendMessage(conv._id, url);
      } else {
        await chatService.sendDmMessage(conv._id, url);
      }
      toast({ title: 'Sent!', status: 'success', duration: 2000 });
      setShowSendPicker(false);
    } catch {
      toast({ title: 'Failed to send', status: 'error', duration: 2000 });
    } finally {
      setSendingTo(null);
    }
  }, [sendingTo, short.author, short.hivePermlink, toast]);

  return (
    <Box position="relative" w="100%" h="100%" bg="black" overflow="hidden">
      {/* Video or thumbnail */}
      {(isActive || isPreload) ? (
        <ShortVideoPlayer
          author={short.author}
          permlink={short.permlink}
          autoPlay={isActive}
          muted={isPreload ? true : muted}
        />
      ) : (
        short.thumbnailUrl && (
          <Image
            src={short.thumbnailUrl}
            alt={short.title}
            position="absolute"
            inset="0"
            w="100%"
            h="100%"
            objectFit="cover"
          />
        )
      )}

      {/* Bottom gradient */}
      <Box
        position="absolute"
        bottom={0}
        left={0}
        right={0}
        h="55%"
        bgGradient="linear(to-t, blackAlpha.900, transparent)"
        pointerEvents="none"
      />

      {/* Author + title */}
      <Box position="absolute" bottom={8} left={4} right="80px" zIndex={2}>
        <Flex align="center" mb={2} gap={2}>
          <Image
            src={`https://images.hive.blog/u/${short.author}/avatar/sm`}
            borderRadius="full"
            boxSize="34px"
            border="2px solid white"
            alt={short.author}
            fallbackSrc="https://images.hive.blog/DQmb2DQKTTRSZ8vNn5yppkcMbNnsSHzPeLsz5H5Kzgh2KuM/user.png"
            cursor="pointer"
            onClick={() => router.push(`/@${short.author}`)}
            _hover={{ opacity: 0.85 }}
            transition="opacity 0.15s ease"
          />
          <Text
            color="white"
            fontWeight="bold"
            fontSize="sm"
            cursor="pointer"
            onClick={() => router.push(`/@${short.author}`)}
            _hover={{ textDecoration: 'underline' }}
          >@{short.author}</Text>
          {short.timeAgo && (
            <Text color="whiteAlpha.700" fontSize="xs">{short.timeAgo}</Text>
          )}
        </Flex>
        {short.title && (
          <Text color="white" fontSize="sm" noOfLines={2} lineHeight="1.4">
            {short.title}
          </Text>
        )}
      </Box>

      {/* Right-rail actions */}
      <VStack
        position="absolute"
        right={3}
        bottom={10}
        spacing={4}
        align="center"
        zIndex={2}
        pointerEvents="auto"
      >
        {/* Mute / Volume */}
        {isActive && (
          <Menu placement="left">
            <MenuButton
              as={IconButton}
              aria-label={muted ? 'Unmute' : 'Mute'}
              icon={muted ? <FaVolumeMute /> : <FaVolumeUp />}
              variant="ghost"
              color="white"
              fontSize="22px"
              size="lg"
              bg="blackAlpha.500"
              _hover={{ bg: 'whiteAlpha.200', transform: 'scale(1.05)' }}
              _active={{ transform: 'scale(0.92)' }}
              borderRadius="full"
              boxSize="48px"
              minW="48px"
              transition="all 0.15s ease"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleMute(); }}
            />
            <MenuList bg="blackAlpha.900" border="1px solid rgba(255,255,255,0.1)" minW="unset" p={3}>
              <Slider orientation="vertical" min={0} max={100} defaultValue={muted ? 0 : 80} h="80px" w="20px">
                <SliderTrack bg="whiteAlpha.300">
                  <SliderFilledTrack bg="white" />
                </SliderTrack>
                <SliderThumb boxSize={3} />
              </Slider>
            </MenuList>
          </Menu>
        )}

        {/* Like — tap = 100%, long press = weight slider */}
        <Box position="relative">
          {showVoteSlider && (
            <Box
              position="absolute"
              right="56px"
              bottom="4px"
              bg="rgba(0,0,0,0.88)"
              borderRadius="12px"
              border="1px solid rgba(255,255,255,0.15)"
              p={3}
              w="160px"
              zIndex={3}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <Slider min={1} max={100} value={voteWeight} onChange={setVoteWeight}>
                <SliderTrack bg="whiteAlpha.300">
                  <SliderFilledTrack bg="red.400" />
                </SliderTrack>
                <SliderThumb />
              </Slider>
              <HStack mt={2} justify="space-between">
                <Text color="white" fontSize="xs">{voteWeight}%</Text>
                <HStack spacing={1}>
                  <IconButton
                    aria-label="Confirm vote"
                    icon={<FaHeart />}
                    size="xs"
                    colorScheme="red"
                    isLoading={isVoting}
                    onClick={handleWeightedVote}
                  />
                  <IconButton
                    aria-label="Cancel"
                    icon={<CloseIcon boxSize="8px" />}
                    size="xs"
                    variant="ghost"
                    color="white"
                    onClick={() => setShowVoteSlider(false)}
                  />
                </HStack>
              </HStack>
            </Box>
          )}
          <ActionBtn
            icon={liked ? <FaHeart /> : <FaRegHeart />}
            label="Like"
            count={likeCount}
            active={liked}
            activeColor="red.400"
            onClick={handleQuickLike}
            onPointerDown={handleLikePointerDown}
            onPointerUp={handleLikePointerUp}
            onPointerLeave={handleLikePointerUp}
          />
        </Box>

        {/* Comments */}
        <ActionBtn
          icon={<FaComment />}
          label="Comments"
          count={short.stats.comments}
          onClick={onOpenComments}
        />

        {/* Send via chat */}
        <ActionBtn
          icon={<FaPaperPlane />}
          label="Send"
          onClick={handleOpenSendPicker}
        />

        {/* Share */}
        <ActionBtn
          icon={<FaShare />}
          label="Share"
          onClick={handleShare}
        />

        {/* More — follow/mute menu */}
        {user && user !== short.author && (
          <Menu placement="left" onOpen={fetchRelationship}>
            <MenuButton
              as={IconButton}
              aria-label="More"
              icon={<FaEllipsisH />}
              variant="ghost"
              color="white"
              fontSize="24px"
              size="lg"
              bg="blackAlpha.500"
              _hover={{ bg: 'whiteAlpha.200', transform: 'scale(1.05)' }}
              _active={{ transform: 'scale(0.92)' }}
              borderRadius="full"
              boxSize="48px"
              minW="48px"
              transition="all 0.15s ease"
            />
            <MenuList
              bg="rgba(15,15,15,0.96)"
              border="1px solid rgba(255,255,255,0.12)"
              borderRadius="12px"
              minW="180px"
              py={1}
            >
              {relationshipLoading ? (
                <MenuItem bg="transparent" isDisabled>
                  <Spinner size="xs" mr={2} /> Loading…
                </MenuItem>
              ) : (
                <>
                  <MenuItem
                    bg="transparent"
                    color="white"
                    icon={isFollowing ? <FaUserMinus /> : <FaUserPlus />}
                    onClick={handleFollow}
                    isDisabled={relationshipProcessing || isAuthorMuted}
                    _hover={{ bg: 'whiteAlpha.100' }}
                  >
                    {isFollowing ? `Unfollow @${short.author}` : `Follow @${short.author}`}
                  </MenuItem>
                  <MenuItem
                    bg="transparent"
                    color={isAuthorMuted ? 'orange.300' : 'white'}
                    icon={<FaMuteUser />}
                    onClick={handleAuthorMute}
                    isDisabled={relationshipProcessing}
                    _hover={{ bg: 'whiteAlpha.100' }}
                  >
                    {isAuthorMuted ? `Unmute @${short.author}` : `Mute @${short.author}`}
                  </MenuItem>
                </>
              )}
            </MenuList>
          </Menu>
        )}
      </VStack>

      {/* Conversation picker */}
      {showSendPicker && (
        <Modal isOpen onClose={() => setShowSendPicker(false)} size="sm" isCentered>
          <ModalOverlay bg="blackAlpha.800" />
          <ModalContent bg="gray.900" borderRadius="16px" border="1px solid" borderColor="whiteAlpha.200">
            <ModalHeader color="white" fontSize="md" pb={2}>Send to...</ModalHeader>
            <ModalCloseButton color="whiteAlpha.700" />
            <ModalBody pb={5}>
              <Input
                placeholder="Search conversations"
                value={convSearch}
                onChange={e => setConvSearch(e.target.value)}
                mb={3}
                bg="whiteAlpha.100"
                border="none"
                color="white"
                size="sm"
                borderRadius="8px"
                _placeholder={{ color: 'whiteAlpha.400' }}
              />
              {loadingConvs ? (
                <Flex justify="center" py={6}><Spinner color="whiteAlpha.600" /></Flex>
              ) : filteredConvs.length === 0 ? (
                <Text color="whiteAlpha.500" fontSize="sm" textAlign="center" py={6}>
                  {conversations.length === 0 ? 'No conversations yet' : 'No matches'}
                </Text>
              ) : (
                <VStack align="stretch" spacing={1} maxH="300px" overflowY="auto">
                  {filteredConvs.map(conv => {
                    const name = conv.type === 'dm' ? (conv.peer ?? conv.name) : conv.name;
                    const avatarSrc = conv.type === 'dm' && conv.peer ? getHiveAvatarUrl(conv.peer, 'small') : undefined;
                    return (
                      <HStack
                        key={conv._id}
                        p={2}
                        borderRadius="8px"
                        cursor="pointer"
                        _hover={{ bg: 'whiteAlpha.100' }}
                        onClick={() => handleSendToConversation(conv)}
                        opacity={sendingTo && sendingTo !== conv._id ? 0.5 : 1}
                      >
                        <Avatar size="sm" name={name} src={avatarSrc} />
                        <Text color="white" fontSize="sm" flex={1} noOfLines={1}>{name}</Text>
                        {sendingTo === conv._id && <Spinner size="xs" color="whiteAlpha.600" />}
                      </HStack>
                    );
                  })}
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </Box>
  );
}
