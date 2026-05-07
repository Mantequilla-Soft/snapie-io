'use client';

import { Box, Text, Avatar, Flex, Link } from '@chakra-ui/react';
import React, { useMemo, useEffect, useRef } from 'react';
import { Discussion } from '@hiveio/dhive';
import { getPostDate } from '@/lib/utils/GetPostDate';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { speakPlaybackUrl } from '@/lib/utils/snapUtils';
import NextLink from 'next/link';
import InteractionBar from '@/components/shared/InteractionBar';
import SnapieSpeakAudio from '@/components/shared/SnapieSpeakAudio';

type BodySegment = { type: 'html'; html: string } | { type: 'audio'; url: string };

interface PostDetailsProps {
    post: Discussion;
    isEmbedMode?: boolean;
}

const bodySx = {
    textAlign: 'left',
    '& h1': { fontSize: '2xl', fontWeight: 'bold', marginTop: '1.5em', marginBottom: '0.75em', lineHeight: '1.3' },
    '& h2': { fontSize: 'xl', fontWeight: 'bold', marginTop: '1.25em', marginBottom: '0.5em', lineHeight: '1.3' },
    '& h3': { fontSize: 'lg', fontWeight: 'bold', marginTop: '1em', marginBottom: '0.5em', lineHeight: '1.4' },
    '& h4': { fontSize: 'md', fontWeight: 'bold', marginTop: '1em', marginBottom: '0.5em', lineHeight: '1.4' },
    '& h5': { fontSize: 'sm', fontWeight: 'bold', marginTop: '0.75em', marginBottom: '0.5em', lineHeight: '1.4' },
    '& h6': { fontSize: 'xs', fontWeight: 'bold', marginTop: '0.75em', marginBottom: '0.5em', lineHeight: '1.4' },
    '& p': { marginBottom: '1em', lineHeight: '1.6', textAlign: 'inherit' },
    '& img': { marginTop: '1em', marginBottom: '1em', maxWidth: '100%', height: 'auto' },
    '& center': { marginTop: '1em', marginBottom: '1em', display: 'block', textAlign: 'center' },
    '& hr': { marginTop: '1em', marginBottom: '1em' },
    '& center img': { display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    '& .video-container': {
        position: 'relative',
        width: '100%',
        maxWidth: '800px',
        aspectRatio: '16/9',
        marginTop: '1em',
        marginBottom: '1em',
    },
    '& .video-container.vertical': {
        aspectRatio: '3/4',
        maxWidth: 'min(420px, 100%)',
        marginLeft: 'auto',
        marginRight: 'auto',
    },
    '& .video-container iframe': {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        borderRadius: 'md',
        border: 'none',
        display: 'block',
    },
    '& iframe': { maxWidth: '100%', borderRadius: 'md', border: 'none' },
};

export default function PostDetails({ post, isEmbedMode = false }: PostDetailsProps) {
    const { title, author, body, created } = post;
    const postDate = getPostDate(created);

    const bodySegments = useMemo((): BodySegment[] => {
        let html = markdownRenderer(body, { defaultEmojiOwner: author });

        // Fallback: convert any audio.3speak.tv anchor tags the renderer missed
        html = html.replace(
            /<a[^>]*href="(https?:\/\/audio\.3speak\.tv\/play\?[^"]+)"[^>]*>.*?<\/a>/gi,
            (_m, url: string) => {
                const clean = url.replace(/&amp;/gi, '&').replace(/&#38;/gi, '&').trim();
                try {
                    const u = new URL(clean.replace(/^http:/i, 'https:'));
                    u.searchParams.set('mode', 'compact');
                    u.searchParams.set('iframe', '1');
                    return `<div class="audio-container"><iframe src="${u.toString()}"></iframe></div>`;
                } catch { return _m; }
            }
        );

        // Split at audio-container boundaries so each audio becomes a SnapieSpeakAudio component
        const segments: BodySegment[] = [];
        const audioRegex = /<div class="audio-container">[\s\S]*?<\/div>/gi;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = audioRegex.exec(html)) !== null) {
            if (match.index > lastIndex) {
                segments.push({ type: 'html', html: html.slice(lastIndex, match.index) });
            }
            const srcMatch = match[0].match(/src="(https?:\/\/audio\.3speak\.tv[^"]+)"/i);
            if (srcMatch) {
                segments.push({ type: 'audio', url: srcMatch[1] });
            }
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < html.length) {
            segments.push({ type: 'html', html: html.slice(lastIndex) });
        }

        return segments.length > 0 ? segments : [{ type: 'html', html }];
    }, [body, author]);

    const bodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!event.data || event.data.type !== '3speak-player-ready') return;
            if (!event.data.isVertical) return;
            if (!bodyRef.current) return;

            const iframes = bodyRef.current.querySelectorAll<HTMLIFrameElement>('.video-container iframe');
            for (const iframe of iframes) {
                if (iframe.contentWindow === event.source) {
                    const parent = iframe.parentElement;
                    if (parent) parent.classList.add('vertical');
                    const current = iframe.getAttribute('src') || iframe.src;
                    if (!current?.includes('play.3speak.tv')) break;
                    let alreadyMobile = false;
                    try {
                        alreadyMobile = new URL(current, window.location.href).searchParams.get('layout') === 'mobile';
                    } catch { /* ignore */ }
                    if (!alreadyMobile) {
                        iframe.setAttribute('src', speakPlaybackUrl(current, true));
                    }
                    break;
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <Box
            position="relative"
            border="tb1"
            borderRadius={isEmbedMode ? 'none' : '30px'}
            overflow="hidden"
            bg={isEmbedMode ? 'transparent' : 'rgba(8, 24, 40, 0.72)'}
            mb={3}
            p={isEmbedMode ? 2 : 5}
            w="100%"
            boxShadow={isEmbedMode ? 'none' : 'lg'}
            _before={isEmbedMode ? undefined : {
                content: '""',
                position: 'absolute',
                inset: 0,
                backdropFilter: 'blur(16px)',
                zIndex: -1,
            }}
        >
            <Text fontSize="2xl" fontWeight="bold" mb={4} textAlign="center">
                {title}
            </Text>
            <Flex justifyContent="space-between" alignItems="center" mb={4}>
                <Flex alignItems="center">
                    <Avatar size="sm" name={author} src={`https://images.hive.blog/u/${author}/avatar/sm`} />
                    <Box ml={3}>
                        <Text fontWeight="medium" fontSize="sm">
                            {isEmbedMode ? `@${author}` : <Link as={NextLink} href={`/@${author}`}>@{author}</Link>}
                        </Text>
                        <Text fontSize="sm" color="secondary">
                            {postDate}
                        </Text>
                    </Box>
                </Flex>
            </Flex>
            <Box ref={bodyRef} mt={4} data-blog-post-body sx={bodySx}>
                {bodySegments.map((seg, i) =>
                    seg.type === 'audio'
                        ? <SnapieSpeakAudio key={seg.url} playUrl={seg.url} />
                        : <Box key={`html-${i}`} dangerouslySetInnerHTML={{ __html: seg.html }} />
                )}
            </Box>
            <InteractionBar post={post} isEmbedMode={isEmbedMode} showShare={true} />
        </Box>
    );
}
