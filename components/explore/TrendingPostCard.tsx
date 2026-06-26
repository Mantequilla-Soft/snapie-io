'use client';
import { Box, Flex, Text, Image, Badge, HStack, Tag, TagLabel } from '@chakra-ui/react';
import { FaRegComment } from 'react-icons/fa';
import NextLink from 'next/link';
import { Discussion } from '@hiveio/dhive';
import { getPayoutValue } from '@/lib/hive/client-functions';
import { useCombflowPost } from '@/hooks/useCombflowPost';

interface TrendingPostCardProps {
    post: Discussion;
}

export default function TrendingPostCard({ post }: TrendingPostCardProps) {
    const { postData } = useCombflowPost(post.author, post.permlink);

    let thumbnail: string | undefined;
    try {
        const meta = JSON.parse(post.json_metadata || '{}');
        if (Array.isArray(meta.image) && meta.image[0]) {
            thumbnail = `https://images.hive.blog/400x225/${meta.image[0]}`;
        }
    } catch {}

    const payout = parseFloat(getPayoutValue(post)).toFixed(2);
    const sentiment = postData && Math.abs(postData.sentiment_score) > 0.2 ? postData.sentiment : null;
    const sentimentColor = sentiment === 'positive' ? 'green.400' : sentiment === 'negative' ? 'orange.400' : undefined;

    return (
        <Box
            as={NextLink}
            href={`/@${post.author}/${post.permlink}`}
            display="block"
            bg="rgba(8, 24, 40, 0.78)"
            border="tb1"
            borderRadius="12px"
            backdropFilter="blur(18px)"
            p={3}
            _hover={{
                bg: 'rgba(28, 161, 241, 0.08)',
                borderColor: 'rgba(28, 161, 241, 0.25)',
                textDecoration: 'none',
                transform: 'translateY(-1px)',
            }}
            transition="all 0.15s"
            cursor="pointer"
        >
            <Flex gap={3} align="flex-start">
                {thumbnail && (
                    <Image
                        src={thumbnail}
                        alt=""
                        w="80px"
                        h="56px"
                        objectFit="cover"
                        borderRadius="8px"
                        flexShrink={0}
                        bg="whiteAlpha.100"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                )}
                <Box flex={1} minW={0}>
                    <Flex align="flex-start" gap={2} mb={1}>
                        <Text fontWeight="semibold" fontSize="sm" color="white" noOfLines={2} lineHeight="short" flex={1}>
                            {post.title}
                        </Text>
                        {sentimentColor && (
                            <Box w="7px" h="7px" borderRadius="full" bg={sentimentColor} flexShrink={0} mt="4px" />
                        )}
                    </Flex>
                    {postData?.categories && postData.categories.length > 0 && (
                        <HStack spacing={1} mb={2} flexWrap="wrap">
                            {postData.categories.slice(0, 2).map(cat => (
                                <Tag
                                    key={cat}
                                    size="sm"
                                    borderRadius="full"
                                    bg="rgba(28,161,241,0.08)"
                                    border="1px solid rgba(28,161,241,0.15)"
                                    color="whiteAlpha.600"
                                    px={2}
                                    onClick={(e) => e.preventDefault()}
                                >
                                    <TagLabel fontSize="10px" textTransform="capitalize">{cat}</TagLabel>
                                </Tag>
                            ))}
                        </HStack>
                    )}
                    <Flex align="center" justify="space-between" gap={2}>
                        <Text fontSize="xs" color="whiteAlpha.500" noOfLines={1} flex={1} minW={0}>
                            @{post.author}
                        </Text>
                        <HStack spacing={2} flexShrink={0}>
                            <Badge colorScheme="green" variant="subtle" fontSize="xs" borderRadius="full" px={2}>
                                ${payout}
                            </Badge>
                            <HStack spacing={1}>
                                <FaRegComment size={10} color="var(--chakra-colors-whiteAlpha-400)" />
                                <Text fontSize="xs" color="whiteAlpha.400">{post.children}</Text>
                            </HStack>
                        </HStack>
                    </Flex>
                </Box>
            </Flex>
        </Box>
    );
}
