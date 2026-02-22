import { Box, Image, Text, Avatar, Flex, Link } from '@chakra-ui/react';
import React, { useState, useEffect } from 'react';
import { Discussion } from '@hiveio/dhive';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { getPostDate } from '@/lib/utils/GetPostDate';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import InteractionBar from '@/components/shared/InteractionBar';

interface PostCardProps {
    post: Discussion;
}

export default function PostCard({ post }: PostCardProps) {
    const { title, author, body, json_metadata, created } = post;
    const postDate = getPostDate(created);
    const metadata = JSON.parse(json_metadata);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const router = useRouter();

    // **State to control how many images to show initially**
    const [visibleImages, setVisibleImages] = useState<number>(3); // Start with 3 images

    useEffect(() => {
        const images = extractImagesFromBody(body);
        if (images && images.length > 0) {
            setImageUrls(images);
        }
    }, [body]);

    function extractImagesFromBody(body: string): string[] {
        const markdownImageRegex = /!\[.*?\]\((.*?)\)/g;
        const htmlImageRegex = /<img\s+[^>]*src="([^"]*)"[^>]*>/g;
        const markdownMatches = Array.from(body.matchAll(markdownImageRegex)) as RegExpExecArray[];
        const htmlMatches = Array.from(body.matchAll(htmlImageRegex)) as RegExpExecArray[];
        const markdownImages = markdownMatches.map(match => match[1]);
        const htmlImages = htmlMatches.map(match => match[1]);
        return [...markdownImages, ...htmlImages];
    }

    function viewPost() {
        router.push('/@' + author + '/' + post.permlink);
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
            boxShadow={'lg'}
            border="tb1"
            borderRadius="base"
            overflow="hidden"
            bg="muted"
            p={4}
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
            height="100%"
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
    fontWeight="bold" 
    fontSize="lg" 
    textAlign="left" 
    onClick={viewPost} 
    mb={2}
    isTruncated
>
    {title}
</Text>
            {imageUrls.length > 0 && (
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
                                <Box h="200px" w="100%">
                                    <Image
                                        src={url}
                                        alt={title}
                                        borderRadius="base"
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
            <Box mt="auto">
                <InteractionBar post={post} showShare={false} />
            </Box>
        </Box>
    );
}
