'use client';
import { Tooltip, Box } from '@chakra-ui/react';

/** Cosmetic easter-egg badge — marks a post/snap/wave that happens to carry
 *  the Snapie community tag, regardless of "For You" state (cold or warm).
 *  Purely decorative: never affects ranking or scoping (see
 *  lib/discovery/snapTrending.ts:isSnapieCommunityPost). */
export default function SnapieCommunityBadge() {
  return (
    <Tooltip label="Posted in the Snapie community" hasArrow fontSize="xs">
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
        color="primary"
        bg="rgba(28, 161, 241, 0.12)"
        border="1px solid rgba(28, 161, 241, 0.4)"
        flexShrink={0}
        lineHeight="1.4"
      >
        Snapie
      </Box>
    </Tooltip>
  );
}
