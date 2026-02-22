import { Box, Text, Avatar, Flex, Link } from '@chakra-ui/react';
import React from 'react';
import { Discussion } from '@hiveio/dhive';
import { getPostDate } from '@/lib/utils/GetPostDate';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import NextLink from 'next/link';
import InteractionBar from '@/components/shared/InteractionBar';

interface PostDetailsProps {
    post: Discussion;
    isEmbedMode?: boolean;
}

export default function PostDetails({ post, isEmbedMode = false }: PostDetailsProps) {
    const { title, author, body, created } = post;
    const postDate = getPostDate(created);

    return (
        <Box border="tb1" borderRadius={isEmbedMode ? 'none' : 'base'} overflow="hidden" bg={isEmbedMode ? 'transparent' : 'muted'} mb={3} p={isEmbedMode ? 2 : 4} w="100%">
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
            <Box 
                mt={4} 
                dangerouslySetInnerHTML={{ __html: markdownRenderer(body, { defaultEmojiOwner: author }) }}
                sx={{
                    textAlign: 'left',  // Base alignment for all content
                    '& h1': {
                        fontSize: '2xl',
                        fontWeight: 'bold',
                        marginTop: '1.5em',
                        marginBottom: '0.75em',
                        lineHeight: '1.3',
                    },
                    '& h2': {
                        fontSize: 'xl',
                        fontWeight: 'bold',
                        marginTop: '1.25em',
                        marginBottom: '0.5em',
                        lineHeight: '1.3',
                    },
                    '& h3': {
                        fontSize: 'lg',
                        fontWeight: 'bold',
                        marginTop: '1em',
                        marginBottom: '0.5em',
                        lineHeight: '1.4',
                    },
                    '& h4': {
                        fontSize: 'md',
                        fontWeight: 'bold',
                        marginTop: '1em',
                        marginBottom: '0.5em',
                        lineHeight: '1.4',
                    },
                    '& h5': {
                        fontSize: 'sm',
                        fontWeight: 'bold',
                        marginTop: '0.75em',
                        marginBottom: '0.5em',
                        lineHeight: '1.4',
                    },
                    '& h6': {
                        fontSize: 'xs',
                        fontWeight: 'bold',
                        marginTop: '0.75em',
                        marginBottom: '0.5em',
                        lineHeight: '1.4',
                    },
                    '& p': {
                        marginBottom: '1em',
                        lineHeight: '1.6',
                        textAlign: 'inherit'
                    },
                    '& img': {
                        marginTop: '1em',
                        marginBottom: '1em',
                        maxWidth: '100%',
                        height: 'auto'
                    },
                    '& center': {
                        marginTop: '1em',
                        marginBottom: '1em',
                        display: 'block',
                        textAlign: 'center'
                    },
                    '& hr': {
                        marginTop: '1em',
                        marginBottom: '1em'
                    },
                    '& center img': {
                        display: 'block',
                        marginLeft: 'auto',
                        marginRight: 'auto'
                    },
                    '& .video-container': {
                        width: '100%',
                        marginTop: '1em',
                        marginBottom: '1em',
                        textAlign: 'left'
                    },
                    '& .video-container iframe': {
                        width: '100%',
                        aspectRatio: '16/9',
                        borderRadius: 'md',
                        border: 'none'
                    },
                    '& iframe': {
                        maxWidth: '100%',
                        borderRadius: 'md',
                        border: 'none'
                    },
                    '& iframe[src*="audio.3speak.tv"]': {
                        width: '100%',
                        height: '200px',
                        marginTop: '1em',
                        marginBottom: '1em'
                    }
                }}
            />
            <InteractionBar post={post} isEmbedMode={isEmbedMode} showShare={true} />
        </Box>
    );
}
