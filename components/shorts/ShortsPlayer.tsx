'use client';
import { Box, Center, Spinner, Text, Button } from '@chakra-ui/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel, Keyboard } from 'swiper/modules';
import 'swiper/css';
import { useEffect, useState, useCallback } from 'react';
import { useShorts } from '@/hooks/useShorts';
import ShortCard from './ShortCard';

export default function ShortsPlayer() {
  const { shorts, loading, error, hasMore, load } = useShorts();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    load(true);
  }, [load]);

  const onSlideChange = useCallback(
    (swiper: any) => {
      setActiveIndex(swiper.activeIndex);
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
    <Box h="100dvh" overflow="hidden" bg="black">
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
              isNext={i === activeIndex + 1}
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
  );
}
