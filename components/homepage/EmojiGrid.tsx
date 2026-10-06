'use client';

import { Box, Button } from '@chakra-ui/react';
import { ALL_COMMON_EMOJIS } from '@snapie/composer';

/** Emoji picker opened from the composer. Not part of the first-paint graph. */
export default function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Box
      position="absolute"
      zIndex={5}
      mt={1}
      maxH="200px"
      overflowY="auto"
      display="grid"
      gridTemplateColumns="repeat(6, 1fr)"
      gap={1}
      p={2}
      bg="surface"
      borderWidth="1px"
      borderColor="surfaceBorder"
      borderRadius="md"
    >
      {ALL_COMMON_EMOJIS.map((emoji, index) => (
        <Button
          key={index}
          variant="ghost"
          minH="32px"
          w="32px"
          minW="32px"
          p={1}
          fontSize="lg"
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </Button>
      ))}
    </Box>
  );
}
