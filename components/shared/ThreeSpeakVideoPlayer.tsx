'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { Box } from '@chakra-ui/react';
import {
  isKnownVerticalSpeak,
  rememberVerticalSpeak,
  speakSlotAspect,
  type SpeakAspect,
} from '@/lib/media/speakSlotAspect';

const ThreeSpeakVideoPlayerInner = dynamic(
  () => import('./ThreeSpeakVideoPlayerInner'),
  { ssr: false },
);

/**
 * The aspect box lives in this module, which the feed imports directly.
 * The player chunk loads into the box. An empty dynamic() render used to
 * drop the slot to 0px, the offscreen gate treated that as "left the
 * scrollport", and the placeholder popped back — one layout shift per frame
 * until the chunk arrived.
 */
export default function ThreeSpeakVideoPlayer({ author, permlink }: { author: string; permlink: string }) {
  const key = `${author}/${permlink}`;
  const [aspect, setAspect] = useState<SpeakAspect>(() => (
    isKnownVerticalSpeak(key) ? '3/4' : '16/9'
  ));

  const onVertical = useCallback((top: number, viewportHeight: number) => {
    const next = speakSlotAspect({
      knownVertical: isKnownVerticalSpeak(key),
      reportedVertical: true,
      top,
      viewportHeight,
    });
    if (next === '3/4') rememberVerticalSpeak(key);
    setAspect((current) => (current === next ? current : next));
  }, [key]);

  const maxW = aspect === '3/4'
    ? 'min(420px, 100%)'
    : { base: '100%', md: '640px', lg: '800px' };

  return (
    <Box
      position="relative"
      width="100%"
      maxW={maxW}
      mx="auto"
      my={4}
      overflow="hidden"
      bg="black"
      borderRadius="md"
      style={{ aspectRatio: aspect === '3/4' ? '3 / 4' : '16 / 9' }}
    >
      <ThreeSpeakVideoPlayerInner author={author} permlink={permlink} onVertical={onVertical} />
    </Box>
  );
}
