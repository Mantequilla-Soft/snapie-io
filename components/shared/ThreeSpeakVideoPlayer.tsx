'use client';

import dynamic from 'next/dynamic';
import { Box, Center, Spinner } from '@chakra-ui/react';

const ThreeSpeakVideoPlayerInner = dynamic(
  () => import('./ThreeSpeakVideoPlayerInner'),
  {
    ssr: false,
    loading: () => (
      <Box position="relative" width="100%" maxWidth={{ base: '100%', md: '640px', lg: '800px' }} aspectRatio="16/9" borderRadius="md" overflow="hidden" bg="black" my={4} mx="auto">
        <Center position="absolute" inset="0">
          <Spinner color="white" size="lg" />
        </Center>
      </Box>
    ),
  },
);

export default function ThreeSpeakVideoPlayer({ author, permlink }: { author: string; permlink: string }) {
  return <ThreeSpeakVideoPlayerInner author={author} permlink={permlink} />;
}
