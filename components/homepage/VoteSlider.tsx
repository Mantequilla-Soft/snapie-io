import { Box, Button, Flex, Icon, Slider, SliderTrack, SliderFilledTrack, SliderThumb, HStack, Text, useToast } from '@chakra-ui/react';
import { memo, useState } from 'react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { useRememberedVoteWeight } from '@/hooks/useRememberedVoteWeight';
import VotersModal from '@/components/shared/VotersModal';

interface VoteControlsProps {
    initialVoted: boolean;
    initialVoteCount: number;
    onVote: (weight: number) => Promise<any>;
    onVoteOptimistic?: (weight: number) => void;
    onVoteRollback?: () => void;
    /** When both are provided, tapping the vote count opens a voters list modal. */
    author?: string;
    permlink?: string;
}

const VoteControls = memo(({ initialVoted, initialVoteCount, onVote, onVoteOptimistic, onVoteRollback, author, permlink }: VoteControlsProps) => {
    const [voted, setVoted] = useState(initialVoted);
    const [voteCount, setVoteCount] = useState(initialVoteCount);
    const [showSlider, setShowSlider] = useState(false);
    const [showVotersModal, setShowVotersModal] = useState(false);
    const { weight: sliderValue, setWeight: setSliderValue, rememberWeight } = useRememberedVoteWeight(5);
    const [isVoting, setIsVoting] = useState(false);
    const toast = useToast();

    async function handleVote() {
        // Optimistic update
        const wasVoted = voted;
        const previousCount = voteCount;
        
        setVoted(true);
        if (!wasVoted) {
            setVoteCount(prev => prev + 1);
            onVoteOptimistic?.(sliderValue);
        }
        setIsVoting(true);

        try {
            const result = await onVote(sliderValue);

            if (!result.success) {
                setVoted(wasVoted);
                setVoteCount(previousCount);
                onVoteRollback?.();
                toast({
                    title: 'Vote Failed',
                    description: 'Failed to vote. Please try again.',
                    status: 'error',
                    duration: 3000,
                });
            } else {
                setShowSlider(false);
                rememberWeight(sliderValue);
            }
        } catch (error) {
            setVoted(wasVoted);
            setVoteCount(previousCount);
            onVoteRollback?.();
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
            <Flex alignItems="center" width="100%" flexBasis="100%">
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
        <>
            <HStack spacing={0}>
                <Button variant="ghost" onClick={toggleSlider} px={2}>
                    <Icon as={voted ? FaHeart : FaRegHeart} color={voted ? "red.400" : undefined} />
                </Button>
                <Button
                    variant="ghost"
                    px={1}
                    isDisabled={!author || !permlink || voteCount === 0}
                    onClick={() => setShowVotersModal(true)}
                >
                    {voteCount}
                </Button>
            </HStack>
            {author && permlink && (
                <VotersModal
                    isOpen={showVotersModal}
                    onClose={() => setShowVotersModal(false)}
                    author={author}
                    permlink={permlink}
                />
            )}
        </>
    );
});

VoteControls.displayName = 'VoteControls';

export default VoteControls;
