'use client';
import { Tooltip, Box } from '@chakra-ui/react';

/** Marks a Blog "For You" post found via topic search rather than the
 *  live/recent pool — see lib/discovery/postInterestPool.ts's
 *  fetchTopicSearchMatches. These are genuinely on-topic but can be old
 *  (hivesense-api ranks by relevance, not recency), so they're kept visibly
 *  distinct from a fresh interest match rather than blended in silently. */
export default function TopicSearchBadge() {
  return (
    <Tooltip label="Found by searching your interests, not from recent activity — may be older" hasArrow fontSize="xs">
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
        bg="transparent"
        border="1px solid var(--chakra-colors-overlay-400)"
        flexShrink={0}
        lineHeight="1.4"
      >
        Classic
      </Box>
    </Tooltip>
  );
}
