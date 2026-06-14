'use client';

import {
  Box, VStack, Text, IconButton, useDisclosure, useToast,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
  Menu, MenuButton, MenuList, HStack, Icon,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import {
  FaHeart, FaRegHeart, FaComment, FaShare, FaVolumeUp, FaVolumeMute, FaEllipsisH,
} from 'react-icons/fa';
import { useState, useRef, useCallback } from 'react';
import { vote } from '@/lib/hive/client-functions';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── ActionBtn (YouTube-style) ──────────────────────────────────────────────

interface ActionBtnProps {
  icon: React.ReactElement;
  label?: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onClick?: () => void;
}

function ActionBtn({ icon, label, count, active, activeColor, onClick }: ActionBtnProps) {
  return (
    <VStack spacing={1}>
      <IconButton
        aria-label={label || 'Action'}
        icon={icon}
        variant="ghost"
        color={active ? activeColor || 'red.400' : 'white'}
        fontSize="24px"
        size="lg"
        onClick={onClick}
        bg="blackAlpha.40"
        _hover={{ bg: 'whiteAlpha.20', transform: 'scale(1.05)' }}
        _active={{ transform: 'scale(0.92)' }}
        borderRadius="full"
        boxSize="44px"
        minW="44px"
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

// ─── Props ──────────────────────────────────────────────────────────────────

interface ShortCardActionsProps {
  author: string;
  hivePermlink: string;
  username: string | null;
  stats: { likes: number; comments: number };
  isActive: boolean;
  muted: boolean;
  volume: number;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onLikeChange?: (liked: boolean, count: number) => void;
  onOpenComments: () => void;
  /** Override for share handler (default: Web Share API / clipboard) */
  onShare?: () => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ShortCardActions({
  author,
  hivePermlink,
  username,
  stats,
  isActive,
  muted,
  volume,
  onVolumeChange,
  onToggleMute,
  onLikeChange,
  onOpenComments,
  onShare,
}: ShortCardActionsProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(stats.likes);
  const [showVoteSlider, setShowVoteSlider] = useState(false);
  const [voteWeight, setVoteWeight] = useState(100);
  const [isVoting, setIsVoting] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  // ── Quick like (100% weight) ──────────────────────────────────────────

  const handleQuickLike = useCallback(async () => {
    if (!username) {
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
      const result = await vote({
        username,
        author,
        permlink: hivePermlink,
        weight: 10000,
      });
      if (!result.success) {
        setLiked(false);
        setLikeCount(prev);
        toast({ title: 'Vote failed', status: 'error', duration: 2000 });
      } else {
        if (navigator.vibrate) navigator.vibrate(20);
        onLikeChange?.(true, likeCount + 1);
      }
    } catch {
      setLiked(false);
      setLikeCount(prev);
    } finally {
      setIsVoting(false);
    }
  }, [username, author, hivePermlink, liked, likeCount, toast, onLikeChange]);

  // ── Weighted vote ─────────────────────────────────────────────────────

  const handleWeightedVote = useCallback(async () => {
    if (!username || liked) return;
    setShowVoteSlider(false);
    const prev = likeCount;
    setLiked(true);
    setLikeCount(p => p + 1);
    setIsVoting(true);
    try {
      const result = await vote({
        username,
        author,
        permlink: hivePermlink,
        weight: voteWeight * 100,
      });
      if (!result.success) {
        setLiked(false);
        setLikeCount(prev);
      } else {
        onLikeChange?.(true, likeCount + 1);
      }
    } catch {
      setLiked(false);
      setLikeCount(prev);
    } finally {
      setIsVoting(false);
    }
  }, [username, author, hivePermlink, liked, likeCount, voteWeight, onLikeChange]);

  // ── Long press for weight slider ──────────────────────────────────────

  const handleLikePointerDown = () => {
    holdTimer.current = setTimeout(() => {
      if (username && !liked) setShowVoteSlider(true);
    }, 400);
  };
  const handleLikePointerUp = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  // ── Share ─────────────────────────────────────────────────────────────

  const handleShare = useCallback(() => {
    if (onShare) {
      onShare();
      return;
    }
    const url = `https://3speak.tv/watch?v=${author}/${hivePermlink}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Check this out!', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(
        () => toast({ title: 'Link copied', status: 'success', duration: 2000 }),
        () => toast({ title: 'Copy failed', status: 'error', duration: 2000 }),
      );
    }
  }, [author, hivePermlink, onShare, toast]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <VStack
      position="absolute"
      right={3}
      bottom={28}
      spacing={4}
      align="center"
      zIndex={2}
      pointerEvents="auto"
    >
      {/* ── Mute / Volume ─────────────────────────────────────────────── */}
      {isActive && (
        <Menu>
          <MenuButton
            as={IconButton}
            aria-label={muted ? 'Unmute' : 'Mute'}
            icon={muted ? <FaVolumeMute /> : <FaVolumeUp />}
            variant="ghost"
            color="white"
            fontSize="22px"
            size="lg"
            bg="blackAlpha.40"
            _hover={{ bg: 'whiteAlpha.20' }}
            borderRadius="full"
            boxSize="44px"
            minW="44px"
            onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          />
          <MenuList bg="blackAlpha.900" border="none" minW="30px" p={2}>
            <Slider
              orientation="vertical"
              min={0}
              max={100}
              value={volume}
              onChange={onVolumeChange}
              h="100px"
              w="20px"
            >
              <SliderTrack bg="whiteAlpha.300">
                <SliderFilledTrack bg="white" />
              </SliderTrack>
              <SliderThumb boxSize={3} />
            </Slider>
          </MenuList>
        </Menu>
      )}

      {/* ── Like ──────────────────────────────────────────────────────── */}
      <Box position="relative">
        {showVoteSlider && (
          <Box
            position="absolute"
            right="52px"
            bottom="4px"
            bg="rgba(0,0,0,0.88)"
            borderRadius="12px"
            border="1px solid rgba(255,255,255,0.15)"
            p={3}
            w="160px"
            zIndex={3}
            onClick={(e) => e.stopPropagation()}
          >
            <Slider
              min={1}
              max={100}
              value={voteWeight}
              onChange={setVoteWeight}
            >
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
        <Box
          onPointerDown={handleLikePointerDown}
          onPointerUp={handleLikePointerUp}
          onPointerLeave={handleLikePointerUp}
        >
          <ActionBtn
            icon={liked ? <FaHeart /> : <FaRegHeart />}
            label="Like"
            count={likeCount}
            active={liked}
            activeColor="red.400"
            onClick={handleQuickLike}
          />
        </Box>
      </Box>

      {/* ── Comments ──────────────────────────────────────────────────── */}
      <ActionBtn
        icon={<FaComment />}
        label="Comments"
        count={stats.comments}
        onClick={onOpenComments}
      />

      {/* ── Share ──────────────────────────────────────────────────────── */}
      <ActionBtn
        icon={<FaShare />}
        label="Share"
        onClick={handleShare}
      />

      {/* ── More ────────────────────────────────────────────────────────── */}
      <ActionBtn
        icon={<FaEllipsisH />}
        label="More"
        onClick={() => {}}
      />
    </VStack>
  );
}
