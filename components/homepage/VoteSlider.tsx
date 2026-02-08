import { Box, Button, Flex, Slider, SliderTrack, SliderFilledTrack, SliderThumb } from '@chakra-ui/react';
import { memo, useState } from 'react';

interface VoteSliderProps {
    onVote: (weight: number) => Promise<void>;
    onClose: () => void;
}

const VoteSlider = memo(({ onVote, onClose }: VoteSliderProps) => {
    const [sliderValue, setSliderValue] = useState(5);
    const [isVoting, setIsVoting] = useState(false);

    async function handleVote() {
        setIsVoting(true);
        try {
            await onVote(sliderValue);
        } finally {
            setIsVoting(false);
        }
    }

    return (
        <Flex mt={4} alignItems="center">
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
            <Button size="xs" onClick={onClose} ml={2}>X</Button>
        </Flex>
    );
});

VoteSlider.displayName = 'VoteSlider';

export default VoteSlider;
