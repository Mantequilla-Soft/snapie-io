'use client';
import {
  Box, Flex, Text, Image, VStack, IconButton, useDisclosure, useToast,
} from '@chakra-ui/react';
import { usePlayer } from '@mantequilla-soft/3speak-player/react';
import { FaHeart, FaRegHeart, FaComment, FaShare, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
import { ShortItem } from '@/lib/shorts/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAioha } from '@aioha/react-ui';
import { vote } from '@/lib/hive/client-functions';
import ShortsCommentSheet from './ShortsCommentSheet';

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
  // usePlayer returns a callback ref, not a RefObject — we can't read .current from it.
  // Capture the element ourselves via a combined ref so we can imperatively toggle muted.
  const localRef = useRef<HTMLVideoElement | null>(null);
  const { ref: playerCallbackRef } = usePlayer({
    apiBase: 'https://play.3speak.tv',
    autoLoad: `${author}/${permlink}`,
    autoPlay,
    muted: true, // always start muted — autoplay requires it; we flip it below
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

  // usePlayer only reads autoPlay at mount — it never re-triggers play/pause on prop change.
  // When this slide transitions from preload→active or active→preload, drive it imperatively.
  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    if (autoPlay) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [autoPlay]);

  // React's `muted` JSX prop is broken — setting it false via JSX does nothing.
  useEffect(() => {
    if (localRef.current) {
      localRef.current.muted = muted;
    }
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
  const { user } = useAioha();
  const toast = useToast();

  async function handleLike() {
    if (!user) {
      toast({ title: 'Login to like', status: 'info', duration: 2000, isClosable: true });
      return;
    }
    if (liked) return;
    const prev = likeCount;
    setLiked(true);
    setLikeCount(p => p + 1);
    try {
      const result = await vote({ username: user, author: short.author, permlink: short.hivePermlink, weight: 10000 });
      if (!result.success) {
        setLiked(false);
        setLikeCount(prev);
        toast({ title: 'Vote failed', status: 'error', duration: 2000, isClosable: true });
      }
    } catch {
      setLiked(false);
      setLikeCount(prev);
    }
  }

  function handleShare() {
    const url = `https://3speak.tv/watch?v=${short.author}/${short.hivePermlink}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(
        () => toast({ title: 'Link copied', status: 'success', duration: 2000, isClosable: true }),
        () => toast({ title: 'Copy failed', status: 'error', duration: 2000, isClosable: true }),
      );
    }
  }

  return (
    <Box position="relative" w="100%" h="100%" bg="black" overflow="hidden">
      {/* Active: playing. Next: mounted but invisible (HLS buffers silently). Others: thumbnail. */}
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
          />
          <Text color="white" fontWeight="bold" fontSize="sm">@{short.author}</Text>
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
        spacing={5}
        align="center"
        zIndex={2}
      >
        {/* Mute toggle — only shown on active slide */}
        {isActive && (
          <IconButton
            aria-label={muted ? 'Unmute' : 'Mute'}
            icon={muted ? <FaVolumeMute /> : <FaVolumeUp />}
            variant="ghost"
            color="white"
            fontSize="22px"
            size="lg"
            onClick={onToggleMute}
            _hover={{ bg: 'whiteAlpha.200' }}
          />
        )}

        <VStack spacing={0}>
          <IconButton
            aria-label="Like"
            icon={liked ? <FaHeart /> : <FaRegHeart />}
            variant="ghost"
            color={liked ? 'red.400' : 'white'}
            fontSize="24px"
            size="lg"
            onClick={handleLike}
            _hover={{ bg: 'whiteAlpha.200' }}
          />
          <Text color="white" fontSize="xs" fontWeight="bold">{likeCount}</Text>
        </VStack>

        <VStack spacing={0}>
          <IconButton
            aria-label="Comments"
            icon={<FaComment />}
            variant="ghost"
            color="white"
            fontSize="22px"
            size="lg"
            onClick={openComments}
            _hover={{ bg: 'whiteAlpha.200' }}
          />
          <Text color="white" fontSize="xs" fontWeight="bold">{short.stats.comments}</Text>
        </VStack>

        <IconButton
          aria-label="Share"
          icon={<FaShare />}
          variant="ghost"
          color="white"
          fontSize="22px"
          size="lg"
          onClick={handleShare}
          _hover={{ bg: 'whiteAlpha.200' }}
        />
      </VStack>

      {/* Comments drawer - stays mounted over the swiper */}
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
