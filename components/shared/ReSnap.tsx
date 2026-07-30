'use client';
import { Box, Text, HStack, Badge } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/shared/Avatar';
import { MoodBadgeIcon } from '@/components/shared/MoodBadgeIcon';
import { useMoodBadges } from '@/hooks/useMoodBadges';
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
    const router = useRouter();
    const { getEquippedBadge } = useMoodBadges();
    const commentDate = getPostDate(comment.created);

    // The card as a whole opens the original snap, but its own body is
    // rendered markdown that can contain real links (mentions, URLs) — those
    // need to keep working on their own terms, not get swallowed by the
    // card's navigation. Bailing out whenever the click lands on (or inside)
    // an <a> keeps both intents working without nesting an anchor inside
    // another one, which the resulting HTML would otherwise do.
    function handleOpen(e: React.MouseEvent<HTMLDivElement>) {
        if ((e.target as HTMLElement).closest('a')) return;
        router.push(`/@${comment.author}/${comment.permlink}`);
    }
    
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
            cursor="pointer"
            transition="transform 0.15s, box-shadow 0.15s"
            _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
            onClick={handleOpen}
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
                    username={comment.author}
                    overlay={
                        getEquippedBadge(comment.author)
                            ? <MoodBadgeIcon sku={getEquippedBadge(comment.author)!} username={comment.author} size="16px" />
                            : undefined
                    }
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
                        },
                        "& ul": { paddingLeft: "1.5em", marginBottom: 2, listStyleType: "disc" },
                        "& ol": { paddingLeft: "1.5em", marginBottom: 2, listStyleType: "decimal" },
                        "& li": { marginBottom: "0.15em", lineHeight: "1.6" },
                        "& blockquote": {
                            borderLeft: "3px solid",
                            borderColor: "border",
                            marginTop: "0.5em",
                            marginBottom: "0.5em",
                            marginLeft: 0,
                            paddingLeft: "0.75em",
                            paddingRight: "0.75em",
                            paddingTop: "0.25em",
                            paddingBottom: "0.25em",
                            fontStyle: "italic",
                            color: "secondary",
                            bg: "muted",
                            borderRadius: "0 6px 6px 0",
                        },
                        "& blockquote p": { marginBottom: "0.25em" },
                        "& blockquote p:last-child": { marginBottom: 0 },
                    }}
                />
            )}
        </Box>
    );
}
