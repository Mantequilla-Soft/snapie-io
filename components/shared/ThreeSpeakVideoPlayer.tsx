'use client';

import React, { useState } from 'react';
import { Box, Spinner, Center, Text } from '@chakra-ui/react';
import { usePlayer } from '@mantequilla-soft/3speak-player/react';

interface ThreeSpeakVideoPlayerProps {
    author: string;
    permlink: string;
}

export default function ThreeSpeakVideoPlayer({ author, permlink }: ThreeSpeakVideoPlayerProps) {
    const [fatalError, setFatalError] = useState(false);

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
    const aspectRatio = isVertical ? '3/4' : '16/9';
    const maxW = isVertical ? 'min(420px, 100%)' : '800px';
    const showSpinner = !state.ready && !fatalError;

    return (
        <Box
            position="relative"
            width="100%"
            maxWidth={maxW}
            aspectRatio={aspectRatio}
            borderRadius="md"
            overflow="hidden"
            bg="black"
            my={4}
            mx={isVertical ? 'auto' : undefined}
        >
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
                ref={ref}
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
        </Box>
    );
}
