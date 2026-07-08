'use client';
import { Tooltip, Box } from '@chakra-ui/react';
import { FiCheckCircle } from 'react-icons/fi';

interface WitnessBadgeProps {
  voted: boolean | null | undefined;
}

// Deliberately separate from PatronBadge — voting is free and binary (you
// either did or didn't), so it doesn't fit a value-scaled tier ladder.
export default function WitnessBadge({ voted }: WitnessBadgeProps) {
  if (!voted) return null;

  return (
    <Tooltip label="Votes for Snapie as a Hive witness" hasArrow fontSize="xs">
      <Box
        as="span"
        display="inline-flex"
        alignItems="center"
        gap="3px"
        px="6px"
        py="1px"
        borderRadius="full"
        fontSize="9px"
        fontWeight="bold"
        letterSpacing="wide"
        textTransform="uppercase"
        color="overlay.700"
        bg="transparent"
        border="1px solid rgba(72, 187, 120, 0.5)"
        flexShrink={0}
        lineHeight="1.4"
      >
        <FiCheckCircle size={9} />
        Witness
      </Box>
    </Tooltip>
  );
}
