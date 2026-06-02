import { Box, Image, Text, Avatar, Flex, Link } from '@chakra-ui/react';
import React, { useState, useEffect } from 'react';
import { Discussion } from '@hiveio/dhive';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { getPostDate } from '@/lib/utils/GetPostDate';
import NextLink from 'next/link';
import InteractionBar from '@/components/shared/InteractionBar';

interface PostCardProps {
    post: Discussion;
    compact?: boolean;
}

export default function PostCard({ post, compact = false }: PostCardProps) {
    const { title, author, body, json_metadata, created } = post;
    const postDate = getPostDate(created);
    const metadata = typeof json_metadata === 'object' && json_metadata !== null
        ? json_metadata
        : (() => { try { return JSON.parse(json_metadata || '{}'); } catch { return {}; } })();
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const safeBody = typeof body === 'string' ? body : '';
    const postHref = `/@${encodeURIComponent(author || '')}/${encodeURIComponent(post.permlink || '')}`;
    const snippet = safeBody
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[[^\]]*]\(([^)]+)\)/g, ' ')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

    // **State to control how many images to show initially**
    const [visibleImages, setVisibleImages] = useState<number>(3); // Start with 3 images

    useEffect(() => {
        const images = extractImagesFromBody(body);
        if (images && images.length > 0) {
            setImageUrls(images);
        } else {
            const metaImages = Array.isArray(metadata?.image)
                ? metadata.image.filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
                : [];
            if (metaImages.length > 0) setImageUrls(metaImages);
        }
    }, [body, metadata]);

    function extractImagesFromBody(rawBody: unknown): string[] {
        if (typeof rawBody !== 'string' || !rawBody) return [];

        const markdownImageRegex = /!\[.*?\]\((.*?)\)/g;
        const htmlImageRegex = /<img\s+[^>]*src="([^"]*)"[^>]*>/g;
        const markdownMatches = Array.from(rawBody.matchAll(markdownImageRegex)) as RegExpExecArray[];
        const htmlMatches = Array.from(rawBody.matchAll(htmlImageRegex)) as RegExpExecArray[];
        const markdownImages = markdownMatches.map(match => match[1]);
        const htmlImages = htmlMatches.map(match => match[1]);
        return [...markdownImages, ...htmlImages];
    }

    // **Function to load more slides**
    function handleSlideChange(swiper: any) {
        // Check if user is reaching the end of currently visible images
        if (swiper.activeIndex === visibleImages - 1 && visibleImages < imageUrls.length) {
            setVisibleImages((prev) => Math.min(prev + 3, imageUrls.length)); // Load 3 more slides
        }
    }

    return (
        <Box
            boxShadow="md"
            border="tb1"
            borderRadius="26px"
            overflow="hidden"
            bg="rgba(8, 24, 40, 0.72)"
            p={4}
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
            height="100%"
            backdropFilter="blur(16px)"
            transition="all 0.18s ease"
            _hover={{ transform: 'translateY(-2px)', boxShadow: 'lg', borderColor: 'rgba(102, 228, 255, 0.34)' }}
        >
            <Flex justifyContent="space-between" alignItems="center">
                <Flex alignItems="center">
                    <Avatar size="sm" name={author} src={`https://images.hive.blog/u/${author}/avatar/sm`} />
                    <Box ml={3}>
                        <Text fontWeight="medium" fontSize="sm">
                            <Link as={NextLink} href={`/@${author}`}>@{author}</Link>
                        </Text>
                        <Text fontSize="sm" color="primary">
                            {postDate}
                        </Text>
                    </Box>
                </Flex>
            </Flex>

            {/* Content Section */}
            <Box display="flex" flexDirection="column" flexGrow={1} cursor="pointer">
                <Text
                    as={NextLink}
                    href={postHref}
                    fontWeight="bold"
                    fontSize="lg"
                    textAlign="left"
                    mb={2}
                    noOfLines={compact ? 2 : 1}
                    _hover={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                    {title || 'Untitled post'}
                </Text>
                {compact && snippet && (
                    <Text
                        as={NextLink}
                        href={postHref}
                        fontSize="sm"
                        color="text"
                        opacity={0.82}
                        noOfLines={3}
                        mb={3}
                        _hover={{ opacity: 1 }}
                    >
                        {snippet}
                    </Text>
                )}
            {imageUrls.length > 0 && !compact && (
                <Box flex="1" display="flex" alignItems="flex-end" justifyContent="center">
                    <Swiper
                        spaceBetween={10}
                        slidesPerView={1}
                        pagination={{ clickable: true }}
                        navigation={true}
                        modules={[Navigation, Pagination]}
                        onSlideChange={handleSlideChange} // Listen to slide changes
                    >
                        {imageUrls.slice(0, visibleImages).map((url, index) => (
                            <SwiperSlide key={index}>
                                <Box as={NextLink} href={postHref} h="200px" w="100%" cursor="pointer">
                                    <Image
                                        src={url}
                                        alt={title}
                                        borderRadius="22px"
                                        objectFit="cover"
                                        w="100%"
                                        h="100%"
                                        loading="lazy"
                                    />
                                </Box>
                            </SwiperSlide>
                        ))}
                    </Swiper>
                </Box>
            )}
        </Box>

            {/* Interaction Bar */}
            <Box mt="auto" opacity={compact ? 0.92 : 1}>
                <InteractionBar post={post} showShare={false} />
            </Box>
        </Box>
    );
}
