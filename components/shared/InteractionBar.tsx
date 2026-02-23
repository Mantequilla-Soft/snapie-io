import { Box, Flex, Icon, Button, Text, Slider, SliderTrack, SliderFilledTrack, SliderThumb, useToast } from '@chakra-ui/react';
import React, { useState, useEffect } from 'react';
import { Discussion } from '@hiveio/dhive';
import { FaHeart, FaComment, FaRegHeart, FaShare } from 'react-icons/fa';
import { useKeychain } from '@/contexts/KeychainContext';
import { vote } from '@/lib/hive/client-functions';
import { useCurrencyDisplay } from '@/hooks/useCurrencyDisplay';

interface InteractionBarProps {
    post: Discussion;
    showShare?: boolean;
    onCommentClick?: () => void;
    isEmbedMode?: boolean;
}

export default function InteractionBar({ 
    post, 
    showShare = true, 
    onCommentClick,
    isEmbedMode = false 
}: InteractionBarProps) {
    const { user } = useKeychain();
    const [sliderValue, setSliderValue] = useState(100);
    const [showSlider, setShowSlider] = useState(false);
    const [voted, setVoted] = useState(false);
    const [voteCount, setVoteCount] = useState(post.active_votes?.length || 0);
    const payoutDisplay = useCurrencyDisplay(post);
    const toast = useToast();

    // Update voted state when user changes
    useEffect(() => {
        if (user && post.active_votes) {
            setVoted(post.active_votes.some(item => item.voter === user));
        }
    }, [user, post.active_votes]);

    function handleHeartClick() {
        if (!user) {
            toast({
                title: 'Login Required',
                description: 'Please login to vote.',
                status: 'warning',
                duration: 3000,
            });
            return;
        }
        setShowSlider(!showSlider);
    }

    function handleShare() {
        const postUrl = `${window.location.origin}/@${post.author}/${post.permlink}`;
        navigator.clipboard.writeText(postUrl);
        toast({
            title: 'Link Copied!',
            description: 'Post link copied to clipboard. Share it anywhere!',
            status: 'success',
            duration: 3000,
        });
    }

    async function handleVote() {
        if (!user) return;

        // Optimistic update
        const wasVoted = voted;
        const previousCount = voteCount;
        
        setVoted(true);
        if (!wasVoted) {
            setVoteCount(prev => prev + 1);
        }
        setShowSlider(false);
        
        // Send to blockchain
        try {
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

    if (isEmbedMode) {
        return null;
    }

    return (
        <Box mt={4}>
            {showSlider ? (
                <Flex alignItems="center" className="vote-slider">
                    <Box width="100%" mr={2}>
                        <Slider
                            aria-label="vote-slider"
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
                    <Button size="xs" onClick={handleVote}>
                        &nbsp;&nbsp;&nbsp;Vote {sliderValue}%&nbsp;&nbsp;&nbsp;
                    </Button>
                    <Button size="xs" onClick={handleHeartClick} ml={2}>
                        X
                    </Button>
                </Flex>
            ) : (
                <Flex justifyContent="space-between" alignItems="center" className="post-actions">
                    <Flex alignItems="center">
                        {voted ? (
                            <Icon as={FaHeart} onClick={handleHeartClick} cursor="pointer" />
                        ) : (
                            <Icon as={FaRegHeart} onClick={handleHeartClick} cursor="pointer" />
                        )}
                        <Text ml={2} fontSize="sm">{voteCount}</Text>
                        
                        <Icon 
                            as={FaComment} 
                            ml={4} 
                            cursor={onCommentClick ? "pointer" : "default"}
                            onClick={onCommentClick}
                        />
                        <Text ml={2} fontSize="sm">{post.children}</Text>
                        
                        {showShare && (
                            <Icon as={FaShare} ml={4} cursor="pointer" onClick={handleShare} />
                        )}
                    </Flex>
                    <Text fontWeight="bold" fontSize="sm">
                        {payoutDisplay}
                    </Text>
                </Flex>
            )}
        </Box>
    );
}
