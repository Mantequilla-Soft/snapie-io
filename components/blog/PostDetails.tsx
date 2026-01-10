import { Box, Text, Avatar, Flex, Icon, Button, Link, Slider, SliderTrack, SliderFilledTrack, SliderThumb, SliderMark, useToast } from '@chakra-ui/react';
import React, { useState, useEffect } from 'react';
import { Discussion } from '@hiveio/dhive';
import { FaHeart, FaComment, FaRegHeart, FaShare } from 'react-icons/fa';
import { getPostDate } from '@/lib/utils/GetPostDate';
import { useKeychain } from '@/contexts/KeychainContext';
import { vote } from '@/lib/hive/client-functions';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { useCurrencyDisplay } from '@/hooks/useCurrencyDisplay';
import NextLink from 'next/link';

interface PostDetailsProps {
    post: Discussion;
    isEmbedMode?: boolean;
}

export default function PostDetails({ post, isEmbedMode = false }: PostDetailsProps) {
    const { title, author, body, created } = post;
    const postDate = getPostDate(created);
    const { user } = useKeychain();
    const [sliderValue, setSliderValue] = useState(100);
    const [showSlider, setShowSlider] = useState(false);
    const [voted, setVoted] = useState(false);
    const [voteCount, setVoteCount] = useState(post.active_votes?.length || 0);
    const payoutDisplay = useCurrencyDisplay(post);
    const toast = useToast();

    // Update voted state when user changes (e.g., after login/initial load)
    useEffect(() => {
        if (user && post.active_votes) {
            setVoted(post.active_votes.some(item => item.voter === user));
        }
    }, [user, post.active_votes]);

    function handleHeartClick() {
        setShowSlider(!showSlider);
    }

    function handleShare() {
        // Copy post URL to clipboard
        const postUrl = `${window.location.origin}/@${author}/${post.permlink}`;
        navigator.clipboard.writeText(postUrl);
        toast({
            title: 'Link Copied!',
            description: 'Post link copied to clipboard. Share it anywhere!',
            status: 'success',
            duration: 3000,
        });
    }

    async function handleVote() {
        // Optimistic update
        const wasVoted = voted;
        const previousCount = voteCount;
        
        setVoted(true);
        setVoteCount(prev => prev + 1);
        handleHeartClick();
        
        // Send to blockchain
        try {
            if (!user) return;
            const voteResult = await vote({
                username: user,
                author: post.author,
                permlink: post.permlink,
                weight: sliderValue * 100
            });
            
            if (!voteResult.success) {
                // Rollback on failure
                setVoted(wasVoted);
                setVoteCount(previousCount);
                toast({
                    title: 'Vote Failed',
                    description: 'Failed to vote. Please try again.',
                    status: 'error',
                    duration: 3000,
                });
            }
        } catch (error) {
            // Rollback on error
            setVoted(wasVoted);
            setVoteCount(previousCount);
            toast({
                title: 'Vote Failed',
                description: 'An error occurred. Please try again.',
                status: 'error',
                duration: 3000,
            });
        }
    }

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
            {!isEmbedMode && (showSlider ? (
                <Flex mt={4} alignItems="center" className="vote-slider">
                    <Box width="100%" mr={2}>
                        <Slider
                            aria-label="slider-ex-1"
                            min={0}
                            max={100}
                            value={sliderValue}
                            onChange={(val) => setSliderValue(val)}
                        >
                            <SliderTrack>
                                <SliderFilledTrack />
                            </SliderTrack>
                            <SliderThumb />
                        </Slider>
                    </Box>
                    <Button size="xs" onClick={handleVote}>&nbsp;&nbsp;&nbsp;Vote {sliderValue} %&nbsp;&nbsp;&nbsp;</Button>
                    <Button size="xs" onClick={handleHeartClick} ml={2}>X</Button>

                </Flex>
            ) : (
                <Flex mt={4} justifyContent="space-between" alignItems="center" className="post-actions">
                    <Flex alignItems="center">
                        {voted ? (
                            <Icon as={FaHeart} onClick={handleHeartClick} cursor="pointer" />
                        ) : (
                            <Icon as={FaRegHeart} onClick={handleHeartClick} cursor="pointer" />
                        )}
                        
                        <Text ml={2} fontSize="sm">{voteCount}</Text>
                        <Icon as={FaComment} ml={4} />
                        <Text ml={2} fontSize="sm">{post.children}</Text>
                        <Icon as={FaShare} ml={4} cursor="pointer" onClick={handleShare} />
                    </Flex>
                    <Text fontWeight="bold" fontSize="sm">
                        {payoutDisplay}
                    </Text>
                </Flex>
            ))}
        </Box>
    );
}
