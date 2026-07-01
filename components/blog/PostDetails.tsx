'use client';

import { Box, Text, Avatar, Flex, Link, IconButton, Tooltip, HStack, Spinner, useToast, Badge, Tag, TagLabel, Button } from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import { MdTranslate } from 'react-icons/md';
import { Discussion } from '@hiveio/dhive';
import { getPostDate } from '@/lib/utils/GetPostDate';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FaEdit } from 'react-icons/fa';
import InteractionBar from '@/components/shared/InteractionBar';
import SnapieSpeakAudio from '@/components/shared/SnapieSpeakAudio';
import ThreeSpeakVideoPlayer from '@/components/shared/ThreeSpeakVideoPlayer';
import TwitterEmbed from '@/components/shared/TwitterEmbed';
import { extractYouTubeId, isSnapContainer, isWaveContainer } from '@/lib/utils/snapUtils';
import { useCombflowPost } from '@/hooks/useCombflowPost';

type BodySegment =
    | { type: 'html'; html: string }
    | { type: 'audio'; url: string }
    | { type: 'speak-video'; author: string; permlink: string }
    | { type: 'youtube'; videoId: string }
    | { type: 'twitter'; tweetId: string };

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
    '& a': { color: 'var(--chakra-colors-primary)', _hover: { textDecoration: 'underline' } },
    '& img': { marginTop: '1em', marginBottom: '1em', maxWidth: '100%', height: 'auto' },
    '& ul': { paddingLeft: '1.5em', marginBottom: '1em', listStyleType: 'disc' },
    '& ol': { paddingLeft: '1.5em', marginBottom: '1em', listStyleType: 'decimal' },
    '& li': { marginBottom: '0.25em', lineHeight: '1.6' },
    '& ul ul': { listStyleType: 'circle', marginBottom: 0 },
    '& ul ul ul': { listStyleType: 'square' },
    '& center': { marginTop: '1em', marginBottom: '1em', display: 'block', textAlign: 'center' },
    '& hr': { marginTop: '1em', marginBottom: '1em' },
    '& center img': { display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    '& p > img:only-child': { display: 'block', marginLeft: 'auto', marginRight: 'auto' },
    '& iframe': { maxWidth: '100%', borderRadius: 'md', border: 'none' },
};

function extractPlainText(markdown: string): string {
    return markdown
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/[*_~`]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export default function PostDetails({ post, isEmbedMode = false }: PostDetailsProps) {
    const { title, author, body, created } = post;
    const postDate = getPostDate(created);
    const { username: user } = useCurrentUser();
    const router = useRouter();
    const toast = useToast();
    const canEdit = !isEmbedMode && user === author;
    const [translatedText, setTranslatedText] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [nsfwRevealed, setNsfwRevealed] = useState(false);
    const { postData } = useCombflowPost(author, post.permlink);

    const browserLang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
    const showTranslate = !translatedText && (!postData || postData.primary_language !== browserLang);
    const isNsfw = !isEmbedMode && (postData?.is_nsfw ?? false);
    const sentiment = postData && Math.abs(postData.sentiment_score) > 0.2 ? postData.sentiment : null;

    async function handleTranslate() {
        if (isTranslating) return;
        setIsTranslating(true);
        try {
            const targetLang = navigator.language.split('-')[0];
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: extractPlainText(body), targetLang }),
            });
            const data = await res.json();
            if (data.translatedText) {
                setTranslatedText(data.translatedText);
            } else {
                toast({ title: 'Translation failed', description: data.error ?? 'Could not translate.', status: 'error', duration: 3000 });
            }
        } catch {
            toast({ title: 'Translation failed', description: 'Could not reach the translation service.', status: 'error', duration: 3000 });
        } finally {
            setIsTranslating(false);
        }
    }
    // Suppress the parent link for "top snaps" (direct replies to the snap container):
    // navigating there would load the entire container thread (hundreds of snaps).
    const hasParent = Boolean(
        post.depth > 0 &&
        post.parent_author &&
        post.parent_permlink &&
        !isSnapContainer(post.parent_author, post.parent_permlink) &&
        !isWaveContainer(post.parent_author, post.parent_permlink)
    );

    const bodySegments = useMemo((): BodySegment[] => {
        let html = markdownRenderer(body, { defaultEmojiOwner: author });

        // Fallback: convert audio.3speak.tv anchor tags the renderer missed.
        // Only convert when the inner text IS the raw URL (auto-linked plain URL),
        // not when it's a markdown link like [Play on 3Speak](url) — those stay as links.
        html = html.replace(
            /<a[^>]*href="(https?:\/\/audio\.3speak\.tv\/play\?[^"]+)"[^>]*>(.*?)<\/a>/gi,
            (_m, url: string, innerText: string) => {
                const clean = url.replace(/&amp;/gi, '&').replace(/&#38;/gi, '&').trim();
                const textOnly = innerText.replace(/<[^>]*>/g, '').trim();
                // Keep as link if the inner text differs from the URL (it's a labelled link)
                if (textOnly && textOnly !== clean && textOnly !== url.trim()) return _m;
                try {
                    const u = new URL(clean.replace(/^http:/i, 'https:'));
                    u.searchParams.set('mode', 'compact');
                    u.searchParams.set('iframe', '1');
                    return `<div class="audio-container"><iframe src="${u.toString()}"></iframe></div>`;
                } catch { return _m; }
            }
        );

        // Extract 3Speak video-container iframes and replace with placeholders so
        // they render as native <video> elements instead of sandboxed iframes.
        const speakVideoMap = new Map<string, { author: string; permlink: string }>();
        let speakIdx = 0;
        html = html.replace(
            /<div class="video-container">\s*<iframe[^>]*src="https?:\/\/play\.3speak\.tv\/[^"]*[?&]v=([^&"]+)[^"]*"[^>]*>\s*<\/iframe>\s*<\/div>/gi,
            (_match, vParam: string) => {
                let decoded: string;
                try { decoded = decodeURIComponent(vParam); } catch { decoded = vParam; }
                const slash = decoded.indexOf('/');
                if (slash < 1) return _match;
                const videoAuthor = decoded.slice(0, slash);
                const videoPermlink = decoded.slice(slash + 1);
                if (!videoAuthor || !videoPermlink) return _match;
                const key = `__SPEAKVIDEO_${speakIdx++}__`;
                speakVideoMap.set(key, { author: videoAuthor, permlink: videoPermlink });
                return key;
            }
        );

        // Extract YouTube wrappers so we can provide an explicit fallback link in-app
        // when privacy-focused browsers block iframe playback.
        const youtubeMap = new Map<string, string>();
        let youtubeIdx = 0;
        html = html.replace(
            /<div class="videoWrapper">\s*<iframe[^>]*src="https?:\/\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([^"?&/]+)[^"]*"[^>]*>\s*<\/iframe>\s*<\/div>/gi,
            (_match, embeddedId: string) => {
                const id =
                    extractYouTubeId(`https://www.youtube.com/embed/${embeddedId}`) ??
                    (/^[a-zA-Z0-9_-]{11}$/.test(embeddedId) ? embeddedId : null);
                if (!id) return _match;
                const key = `__YOUTUBE_${youtubeIdx++}__`;
                youtubeMap.set(key, id);
                return key;
            }
        );

        // Fallback: promote un-embedded YouTube links (including /live/) into placeholders
        // so users still see the video block + fallback affordance.
        // Only when the anchor text IS the raw URL (auto-linked), not labelled markdown links.
        html = html.replace(
            /<a[^>]*href="(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^"]+)"[^>]*>(.*?)<\/a>/gi,
            (match, rawUrl: string, innerText: string) => {
                const clean = rawUrl.replace(/&amp;/gi, '&').replace(/&#38;/gi, '&').trim();
                const textOnly = innerText.replace(/<[^>]*>/g, '').trim();
                if (textOnly && textOnly !== clean && textOnly !== rawUrl.trim()) return match;
                const id = extractYouTubeId(clean);
                if (!id) return match;
                const key = `__YOUTUBE_${youtubeIdx++}__`;
                youtubeMap.set(key, id);
                return key;
            }
        );

        // Extract Twitter embed containers and replace with placeholders so they
        // render as stable <TwitterEmbed> components instead of dangerouslySetInnerHTML.
        const twitterMap = new Map<string, string>();
        let twitterIdx = 0;
        html = html.replace(
            /<div\s+class="twitter-embed-container"[^>]*>[\s\S]*?<\/div>/gi,
            (match) => {
                const idMatch = match.match(/platform\.twitter\.com\/embed\/Tweet\.html\?id=(\d+)/i);
                if (!idMatch) return match;
                const key = `__TWITTER_${twitterIdx++}__`;
                twitterMap.set(key, idMatch[1]);
                return key;
            }
        );

        // Split at audio-container boundaries so each audio becomes a SnapieSpeakAudio component
        const rawSegments: BodySegment[] = [];
        const audioRegex = /<div class="audio-container">[\s\S]*?<\/div>/gi;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = audioRegex.exec(html)) !== null) {
            if (match.index > lastIndex) {
                rawSegments.push({ type: 'html', html: html.slice(lastIndex, match.index) });
            }
            const srcMatch = match[0].match(/src="(https?:\/\/audio\.3speak\.tv[^"]+)"/i);
            if (srcMatch) {
                rawSegments.push({ type: 'audio', url: srcMatch[1] });
            }
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < html.length) {
            rawSegments.push({ type: 'html', html: html.slice(lastIndex) });
        }

        const base = rawSegments.length > 0 ? rawSegments : [{ type: 'html' as const, html }];

        // Fast path: no extracted embeds
        if (speakVideoMap.size === 0 && twitterMap.size === 0 && youtubeMap.size === 0) return base;

        // Expand speak-video and twitter placeholders within html segments
        const placeholderRe = /(__SPEAKVIDEO_\d+__|__TWITTER_\d+__|__YOUTUBE_\d+__)/g;
        const expanded: BodySegment[] = [];
        for (const seg of base) {
            if (seg.type !== 'html') { expanded.push(seg); continue; }
            const parts = seg.html.split(placeholderRe);
            for (const part of parts) {
                const video = speakVideoMap.get(part);
                if (video) {
                    expanded.push({ type: 'speak-video', author: video.author, permlink: video.permlink });
                    continue;
                }
                const tweetId = twitterMap.get(part);
                if (tweetId) {
                    expanded.push({ type: 'twitter', tweetId });
                    continue;
                }
                const youtubeId = youtubeMap.get(part);
                if (youtubeId) {
                    expanded.push({ type: 'youtube', videoId: youtubeId });
                    continue;
                }
                if (part) {
                    expanded.push({ type: 'html', html: part });
                }
            }
        }
        return expanded;
    }, [body, author]);

    return (
        <Box
            position="relative"
            border="tb1"
            borderRadius={isEmbedMode ? 'none' : 'lg'}
            overflow="hidden"
            bg={isEmbedMode ? 'transparent' : 'rgba(8, 24, 40, 0.72)'}
            mb={3}
            px={isEmbedMode ? 2 : { base: 4, md: 16, lg: 24 }}
            py={isEmbedMode ? 2 : { base: 5, md: 10 }}
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
            <Flex align="center" justify="center" gap={2} mb={1} wrap="wrap">
                <Text fontSize="2xl" fontWeight="bold" textAlign="center">
                    {title}
                </Text>
                {sentiment && (
                    <Badge
                        colorScheme={sentiment === 'positive' ? 'green' : 'orange'}
                        variant="subtle"
                        fontSize="xs"
                        borderRadius="full"
                        px={2}
                        alignSelf="center"
                    >
                        {sentiment === 'positive' ? '↑ Positive' : '↓ Negative'}
                    </Badge>
                )}
            </Flex>
            {postData?.categories && postData.categories.length > 0 && (
                <Flex justify="center" wrap="wrap" gap={2} mb={4}>
                    {postData.categories.map(cat => (
                        <Tag
                            key={cat}
                            as={NextLink}
                            href={`/explore/${encodeURIComponent(cat)}`}
                            size="sm"
                            borderRadius="full"
                            bg="rgba(28, 161, 241, 0.08)"
                            border="1px solid rgba(28, 161, 241, 0.15)"
                            color="whiteAlpha.700"
                            cursor="pointer"
                            _hover={{ bg: 'rgba(28, 161, 241, 0.18)', textDecoration: 'none' }}
                            transition="all 0.15s"
                        >
                            <TagLabel textTransform="capitalize">{cat}</TagLabel>
                        </Tag>
                    ))}
                </Flex>
            )}
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
                {canEdit && (
                    <Tooltip label="Edit post">
                        <IconButton
                            aria-label="Edit post"
                            icon={<FaEdit />}
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/edit/${author}/${post.permlink}`)}
                        />
                    </Tooltip>
                )}
            </Flex>
            {!isEmbedMode && hasParent && (
                <Flex mb={3} gap={3} align="center" wrap="wrap">
                    <Text fontSize="sm" color="secondary">Reply context:</Text>
                    <Link
                        as={NextLink}
                        href={`/@${post.parent_author}/${post.parent_permlink}`}
                        fontSize="sm"
                        color="primary"
                        fontWeight="semibold"
                    >
                        View parent
                    </Link>
                </Flex>
            )}
            {isNsfw && !nsfwRevealed ? (
                <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    gap={3}
                    py={16}
                    my={4}
                    borderRadius="md"
                    border="1px solid rgba(251,191,36,0.25)"
                    bg="rgba(251,191,36,0.05)"
                >
                    <Text fontSize="2xl">⚠️</Text>
                    <Text fontWeight="semibold" color="yellow.300">Sensitive content</Text>
                    <Text fontSize="sm" color="whiteAlpha.600" textAlign="center" maxW="sm">
                        This post has been flagged as potentially sensitive by our content analysis.
                    </Text>
                    <Button size="sm" variant="outline" colorScheme="yellow" onClick={() => setNsfwRevealed(true)}>
                        Show anyway
                    </Button>
                </Flex>
            ) : translatedText ? (
                <Box mt={4}>
                    <Text fontSize="sm" color="gray.400" mb={3}>Translated · <Text as="button" color="primary" _hover={{ textDecoration: 'underline' }} onClick={() => setTranslatedText(null)}>Show original</Text></Text>
                    <Text whiteSpace="pre-wrap" lineHeight="1.7" wordBreak="break-word">{translatedText}</Text>
                </Box>
            ) : (
                <Box mt={4} data-blog-post-body sx={bodySx}>
                    {bodySegments.map((seg, i) => {
                        if (seg.type === 'audio') {
                            return <SnapieSpeakAudio key={`${seg.url}-${i}`} playUrl={seg.url} />;
                        }
                        if (seg.type === 'speak-video') {
                            return <ThreeSpeakVideoPlayer key={`${seg.author}/${seg.permlink}-${i}`} author={seg.author} permlink={seg.permlink} />;
                        }
                        if (seg.type === 'twitter') {
                            return <TwitterEmbed key={`twitter-${seg.tweetId}-${i}`} tweetId={seg.tweetId} />;
                        }
                        if (seg.type === 'youtube') {
                            return (
                                <Box
                                    key={`youtube-${seg.videoId}-${i}`}
                                    position="relative"
                                    w="100%"
                                    maxW={{ base: '100%', md: '640px', lg: '800px' }}
                                    aspectRatio="16/9"
                                    mx="auto"
                                    my={4}
                                    borderRadius="md"
                                    overflow="hidden"
                                    bg="black"
                                >
                                    <Box
                                        as="iframe"
                                        src={`https://www.youtube-nocookie.com/embed/${seg.videoId}`}
                                        title="YouTube video player"
                                        loading="lazy"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        w="100%"
                                        h="100%"
                                        border="none"
                                    />
                                    <Box position="absolute" bottom={2} right={2} bg="blackAlpha.700" px={2} py={1} borderRadius="sm">
                                        <Link
                                            href={`https://www.youtube.com/watch?v=${seg.videoId}`}
                                            isExternal
                                            fontSize="xs"
                                            color="blue.200"
                                            textDecoration="underline"
                                            fontWeight="semibold"
                                        >
                                            Open on YouTube
                                        </Link>
                                    </Box>
                                </Box>
                            );
                        }
                        return <Box key={`html-${i}`} dangerouslySetInnerHTML={{ __html: seg.html }} />;
                    })}
                </Box>
            )}
            {showTranslate && !isNsfw && (
                <HStack spacing={1} mt={3} mb={1} cursor="pointer" color="gray.500" _hover={{ color: 'primary' }} onClick={handleTranslate} width="fit-content">
                    {isTranslating ? <Spinner size="xs" /> : <MdTranslate size={13} />}
                    <Text fontSize="xs">{isTranslating ? 'Translating...' : 'Translate'}</Text>
                </HStack>
            )}
            <InteractionBar post={post} isEmbedMode={isEmbedMode} showShare={true} />
        </Box>
    );
}
