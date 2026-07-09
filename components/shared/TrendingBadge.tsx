'use client';
import { Tooltip, Box } from '@chakra-ui/react';

/** Marks a snap surfaced by the comment-velocity discovery detector, not the normal feed order. */
export default function TrendingBadge() {
  return (
    <Tooltip label="Trending — lots of comments relative to its age" hasArrow fontSize="xs">
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
        color="warning"
        bg="rgba(245, 158, 11, 0.12)"
        border="1px solid rgba(245, 158, 11, 0.4)"
        flexShrink={0}
        lineHeight="1.4"
      >
        Trending
      </Box>
    </Tooltip>
  );
}
