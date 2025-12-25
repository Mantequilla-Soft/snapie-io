'use client';
import { Box, Text, HStack, Avatar, Badge } from '@chakra-ui/react';
import { Comment } from '@hiveio/dhive';
import { useMemo } from 'react';
import { getPostDate } from '@/lib/utils/GetPostDate';
import { separateContent } from '@/lib/utils/snapUtils';
import MediaRenderer from '@/components/shared/MediaRenderer';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';

interface ReSnapProps {
    comment: Comment;
}

/**
 * ReSnap component displays an embedded snap (comment/reply) when someone shares a Hive URL
 * Similar to Twitter's quote tweet or retweet display
 */
export default function ReSnap({ comment }: ReSnapProps) {
    const commentDate = getPostDate(comment.created);
    
    // Separate media from text using SkateHive's pattern
    const { text, media } = useMemo(
        () => separateContent(comment.body),
        [comment.body]
    );

    // Render text as HTML using markdown renderer
    const renderedText = useMemo(
        () => text ? markdownRenderer(text, { defaultEmojiOwner: comment.author }) : '',
        [text, comment.author]
    );

    return (
        <Box
            bg="muted"
            borderWidth="2px"
            borderColor="accent"
            borderRadius="md"
            p={3}
            my={2}
            maxW="full"
            position="relative"
        >
            {/* Re-Snap Badge */}
            <Badge 
                colorScheme="green" 
                position="absolute" 
                top={2} 
                right={2}
                fontSize="xs"
            >
                Re-Snap
            </Badge>

            <HStack mb={2} align="start">
                <Avatar 
                    size="sm" 
                    name={comment.author} 
                    src={`https://images.hive.blog/u/${comment.author}/avatar/sm`}
                />
                <Box>
                    <Text fontWeight="medium" fontSize="sm">
                        @{comment.author}
                    </Text>
                    <Text fontSize="xs" color="secondary">
                        {commentDate}
                    </Text>
                </Box>
            </HStack>

            {/* Render media separately using MediaRenderer */}
            {media && <MediaRenderer mediaContent={media} />}
            
            {/* Render text content with proper markdown processing */}
            {renderedText && (
                <Box 
                    dangerouslySetInnerHTML={{ __html: renderedText }}
                    sx={{
                        "& p": { marginBottom: 2 },
                        "& a": { 
                            color: "primary", 
                            textDecoration: "underline",
                            cursor: "pointer",
                            _hover: {
                                color: "accent"
                            }
                        }
                    }}
                />
            )}
        </Box>
    );
}
