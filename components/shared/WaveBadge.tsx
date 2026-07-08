'use client';
import { Tooltip, Box } from '@chakra-ui/react';

/** Marks a post as originating from Ecency's "waves" container in the blended feed. */
export default function WaveBadge() {
  return (
    <Tooltip label="Cross-posted from Ecency Waves" hasArrow fontSize="xs">
      <Box
        as="span"
        display="inline-flex"
        alignItems="center"
        px="6px"
        py="1px"
        borderRadius="full"
        fontSize="9px"
        fontWeight="bold"
        letterSpacing="wide"
        textTransform="uppercase"
        color="overlay.700"
        bg="overlay.100"
        border="1px solid var(--chakra-colors-overlay-400)"
        flexShrink={0}
        lineHeight="1.4"
      >
        Wave
      </Box>
    </Tooltip>
  );
}
