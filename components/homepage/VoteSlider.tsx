import { Box, Button, Flex, Slider, SliderTrack, SliderFilledTrack, SliderThumb, HStack, Text } from '@chakra-ui/react';
import { memo, useState } from 'react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';

interface VoteControlsProps {
    voted: boolean;
    voteCount: number;
    onVote: (weight: number) => Promise<void>;
}

const VoteControls = memo(({ voted, voteCount, onVote }: VoteControlsProps) => {
    const [showSlider, setShowSlider] = useState(false);
    const [sliderValue, setSliderValue] = useState(5);
    const [isVoting, setIsVoting] = useState(false);

    async function handleVote() {
        setIsVoting(true);
        try {
            await onVote(sliderValue);
            setShowSlider(false);
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
