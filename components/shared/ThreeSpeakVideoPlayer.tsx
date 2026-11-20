'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Center, Spinner } from '@chakra-ui/react';
import SnapieSpeakAudio from '@/components/shared/SnapieSpeakAudio';
import SpeakPlaylistEmbed from '@/components/shared/SpeakPlaylistEmbed';
import { finalizeAudio3SpeakEmbedUrl, speakAudioListId } from '@/lib/utils/snapUtils';

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

/**
 * A play.3speak.tv link. Usually a video; when play.3speak.tv says it is an audio or an
 * audio playlist (the same link shape, see speakAudioEmbedFor), the audio players
 * already used for audio.3speak.tv links take its place.
 */
export default function ThreeSpeakVideoPlayer({ author, permlink }: { author: string; permlink: string }) {
  const ref = `${author}/${permlink}`;
  const [audio, setAudio] = useState<{ ref: string; url: string } | null>(null);

  if (audio?.ref === ref) {
    const listId = speakAudioListId(audio.url);
    return listId
      ? <SpeakPlaylistEmbed listId={listId} />
      : <SnapieSpeakAudio playUrl={finalizeAudio3SpeakEmbedUrl(audio.url)} />;
  }
  return <ThreeSpeakVideoPlayerInner author={author} permlink={permlink} onAudio={(url) => setAudio({ ref, url })} />;
}
