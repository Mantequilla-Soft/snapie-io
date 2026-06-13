'use client';
import { Box, Center, Spinner, Text, Button, useBreakpointValue } from '@chakra-ui/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel, Keyboard } from 'swiper/modules';
import 'swiper/css';
import { useEffect, useState, useCallback } from 'react';
import { useShorts } from '@/hooks/useShorts';
import ShortCard from './ShortCard';
import ShortsCommentSheet from './ShortsCommentSheet';
import ShortsCommentContent from './ShortsCommentContent';

interface ActiveComment {
  author: string;
  permlink: string;
  commentCount: number;
}

export default function ShortsPlayer() {
  const { shorts, loading, error, hasMore, load } = useShorts();
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [activeComment, setActiveComment] = useState<ActiveComment | null>(null);

  const isDesktop = useBreakpointValue({ base: false, md: true }, { ssr: false });

  useEffect(() => {
    load(true);
  }, [load]);

  const onSlideChange = useCallback(
    (swiper: any) => {
      setActiveIndex(swiper.activeIndex);
      setActiveComment(null);
      if (swiper.activeIndex >= shorts.length - 3 && hasMore && !loading) {
        load();
      }
    },
    [shorts.length, hasMore, loading, load],
  );

  if (loading && shorts.length === 0) {
    return (
      <Center h="100dvh" bg="black">
        <Spinner size="xl" color="blue.400" thickness="3px" />
      </Center>
    );
  }

  if (error && shorts.length === 0) {
    return (
      <Center h="100dvh" bg="black" flexDir="column" gap={4}>
        <Text color="red.400">Failed to load shorts</Text>
        <Button onClick={() => load(true)} colorScheme="blue" size="sm">
          Retry
        </Button>
      </Center>
    );
  }

  return (
    <Box h="100dvh" overflow="hidden" bg="black" display="flex" justifyContent="center">
      {/* Video column */}
      <Box w={{ base: '100%', md: '420px' }} h="100dvh" position="relative" overflow="hidden" flexShrink={0}>
        <Swiper
          direction="vertical"
          slidesPerView={1}
          modules={[Mousewheel, Keyboard]}
          mousewheel={{ sensitivity: 1, thresholdDelta: 10 }}
          keyboard={{ enabled: true }}
          onSlideChange={onSlideChange}
          style={{ height: '100%', width: '100%' }}
        >
          {shorts.map((short, i) => (
            <SwiperSlide key={short.id} style={{ height: '100%' }}>
              <ShortCard
                short={short}
                isActive={i === activeIndex}
                isPreload={i === activeIndex - 1 || i === activeIndex + 1}
                muted={muted}
                onToggleMute={() => setMuted(m => !m)}
                onOpenComments={() => setActiveComment({
                  author: short.author,
                  permlink: short.hivePermlink,
                  commentCount: short.stats.comments,
                })}
              />
            </SwiperSlide>
          ))}

          {(loading || hasMore) && (
            <SwiperSlide style={{ height: '100%' }}>
              <Center h="100%" bg="black">
                <Spinner color="blue.400" thickness="2px" />
              </Center>
            </SwiperSlide>
          )}
        </Swiper>
      </Box>

      {/* Desktop: side-by-side comment panel */}
      {isDesktop && activeComment && (
        <Box
          w="380px"
          h="100dvh"
          bg="rgba(8, 24, 40, 0.97)"
          borderLeft="1px solid rgba(28, 161, 241, 0.12)"
          backdropFilter="blur(18px)"
          flexShrink={0}
          overflow="hidden"
        >
          <ShortsCommentContent
            author={activeComment.author}
            permlink={activeComment.permlink}
            commentCount={activeComment.commentCount}
            onClose={() => setActiveComment(null)}
          />
        </Box>
      )}

      {/* Mobile: bottom-sheet drawer */}
      {!isDesktop && (
        <ShortsCommentSheet
          isOpen={!!activeComment}
          onClose={() => setActiveComment(null)}
          author={activeComment?.author ?? ''}
          permlink={activeComment?.permlink ?? ''}
          commentCount={activeComment?.commentCount ?? 0}
        />
      )}
    </Box>
  );
}
