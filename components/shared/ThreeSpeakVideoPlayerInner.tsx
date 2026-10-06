'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Spinner, Center, Text } from '@chakra-ui/react';
import { usePlayer } from '@mantequilla-soft/3speak-player/react';

interface ThreeSpeakVideoPlayerInnerProps {
  author: string;
  permlink: string;
  /** Portrait metadata. The parent decides whether the slot may grow. */
  onVertical?: (top: number, viewportHeight: number) => void;
}

export default function ThreeSpeakVideoPlayerInner({ author, permlink, onVertical }: ThreeSpeakVideoPlayerInnerProps) {
  const [fatalError, setFatalError] = useState(false);
  const videoEl = useRef<HTMLVideoElement | null>(null);

  const { ref, state } = usePlayer({
    apiBase: 'https://play.3speak.tv',
    autoLoad: `${author}/${permlink}`,
    poster: true,
    hlsConfig: {
      maxBufferLength: 600,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
    },
    onError: (err) => {
      if (err.fatal) setFatalError(true);
    },
  });

  const isVertical = state.isVertical === true;
  const showSpinner = !state.ready && !fatalError;

  useLayoutEffect(() => {
    if (!isVertical || !onVertical) return;
    const top = videoEl.current?.parentElement?.getBoundingClientRect().top ?? window.innerHeight;
    onVertical(top, window.innerHeight);
  }, [isVertical, onVertical]);

  return (
    <>
      {showSpinner && (
        <Center position="absolute" inset="0" zIndex={1} bg="blackAlpha.600">
          <Spinner color="white" size="lg" />
        </Center>
      )}

      {fatalError && (
        <Center position="absolute" inset="0" flexDir="column" gap={2} p={4}>
          <Text color="whiteAlpha.800" fontSize="sm" textAlign="center">
            Video could not be loaded.
          </Text>
          <Text
            as="a"
            href={`https://3speak.tv/watch?v=${author}/${permlink}`}
            target="_blank"
            rel="noopener noreferrer"
            color="blue.300"
            fontSize="sm"
            textDecoration="underline"
          >
            Watch on 3speak.tv →
          </Text>
        </Center>
      )}

      <video
        ref={(node) => {
          videoEl.current = node;
          ref(node);
        }}
        controls
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#000',
          display: fatalError ? 'none' : 'block',
        }}
      />
    </>
  );
}
