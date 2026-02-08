import { Box, Button, Flex, Slider, SliderTrack, SliderFilledTrack, SliderThumb, HStack, Text, useToast } from '@chakra-ui/react';
import { memo, useState } from 'react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';

interface VoteControlsProps {
    initialVoted: boolean;
    initialVoteCount: number;
    onVote: (weight: number) => Promise<any>;
}

const VoteControls = memo(({ initialVoted, initialVoteCount, onVote }: VoteControlsProps) => {
    const [voted, setVoted] = useState(initialVoted);
    const [voteCount, setVoteCount] = useState(initialVoteCount);
    const [showSlider, setShowSlider] = useState(false);
    const [sliderValue, setSliderValue] = useState(5);
    const [isVoting, setIsVoting] = useState(false);
    const toast = useToast();

    async function handleVote() {
        // Optimistic update
        const wasVoted = voted;
        const previousCount = voteCount;
        
        setVoted(true);
        setVoteCount(prev => prev + 1);
        setIsVoting(true);
        
        try {
            const result = await onVote(sliderValue);
            
            if (!result.success) {
                // Rollback on failure
                setVoted(wasVoted);
                setVoteCount(previousCount);
                toast({
                    title: 'Vote Failed',
                    description: 'Failed to vote. Please try again.',
                    status: 'error',
                    duration: 3000,
                });
            } else {
                setShowSlider(false);
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
        } finally {
            setIsVoting(false);
        }
    }

    function toggleSlider() {
        setShowSlider(!showSlider);
    }

    if (showSlider) {
        return (
            <Flex mt={4} alignItems="center" width="100%">
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
                <Button size="xs" onClick={handleVote} isLoading={isVoting}>
                    &nbsp;&nbsp;&nbsp;Vote {sliderValue} %&nbsp;&nbsp;&nbsp;
                </Button>
                <Button size="xs" onClick={toggleSlider} ml={2}>X</Button>
            </Flex>
        );
    }

    return (
        <Button leftIcon={voted ? (<FaHeart />) : (<FaRegHeart />)} variant="ghost" onClick={toggleSlider}>
            {voteCount}
        </Button>
    );
});

VoteControls.displayName = 'VoteControls';

export default VoteControls;
