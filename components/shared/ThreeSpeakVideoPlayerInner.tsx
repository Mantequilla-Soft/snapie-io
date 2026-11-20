'use client';

import React, { useEffect, useState } from 'react';
import { Box, Spinner, Center, Text } from '@chakra-ui/react';
import { usePlayer } from '@mantequilla-soft/3speak-player/react';
import { speakAudioEmbedFor } from '@/lib/utils/snapUtils';

interface ThreeSpeakVideoPlayerInnerProps {
    author: string;
    permlink: string;
    /** Called with the audio.3speak.tv URL when the link is an audio or audio playlist. */
    onAudio?: (audioUrl: string) => void;
}

export default function ThreeSpeakVideoPlayerInner({ author, permlink, onAudio }: ThreeSpeakVideoPlayerInnerProps) {
    const [fatalError, setFatalError] = useState(false);

    // Loaded here rather than with `autoLoad`: the SDK does not catch a failed metadata
    // lookup, so a missing video spun forever and an audio link never got its player.
    const { ref, state, load } = usePlayer({
        apiBase: 'https://play.3speak.tv',
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

    useEffect(() => {
        let cancelled = false;
        setFatalError(false);
        load(`${author}/${permlink}`).catch(async () => {
            const audioUrl = onAudio ? await speakAudioEmbedFor(author, permlink) : null;
            if (cancelled) return;
            if (audioUrl) onAudio?.(audioUrl);
            else setFatalError(true);
        });
        return () => {
            cancelled = true;
        };
        // onAudio is a fresh closure each render; the link is what matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [author, permlink, load]);

    const isVertical = state.isVertical === true;
    const aspectRatio = isVertical ? '3/4' : '16/9';
    const maxW = isVertical ? 'min(420px, 100%)' : { base: '100%', md: '640px', lg: '800px' };
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
            mx="auto"
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
