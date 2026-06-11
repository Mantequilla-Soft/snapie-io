'use client';
import {
  Box, Flex, Text, Image, VStack, HStack, IconButton, useDisclosure, useToast,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
  Menu, MenuButton, MenuList, MenuItem, Spinner,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { usePlayer } from '@mantequilla-soft/3speak-player/react';
import {
  FaHeart, FaRegHeart, FaComment, FaShare,
  FaVolumeUp, FaVolumeMute, FaEllipsisH,
  FaUserPlus, FaUserMinus, FaVolumeMute as FaMuteUser,
} from 'react-icons/fa';
import { ShortItem } from '@/lib/shorts/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { vote, getPost } from '@/lib/hive/client-functions';
import { useUserRelationship } from '@/hooks/useUserRelationship';
import { useRouter } from 'next/navigation';
import ShortsCommentSheet from './ShortsCommentSheet';

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
}

export default function ShortCard({ short, isActive, isPreload, muted, onToggleMute }: ShortCardProps) {
  const { isOpen: commentsOpen, onOpen: openComments, onClose: closeComments } = useDisclosure();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(short.stats.likes);
  const [showVoteSlider, setShowVoteSlider] = useState(false);
  const [voteWeight, setVoteWeight] = useState(100);
  const [isVoting, setIsVoting] = useState(false);
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
          onClick={openComments}
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

      {/* Comments sheet */}
      <ShortsCommentSheet
        isOpen={commentsOpen}
        onClose={closeComments}
        author={short.author}
        permlink={short.hivePermlink}
        commentCount={short.stats.comments}
      />
    </Box>
  );
}
