'use client';

import { Box, Heading, HStack, Link as ChakraLink, Text, VStack } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { GAMES_FEATURE_FLAG } from '@/lib/points/config';
import { SnapieBlocksMatch } from '@/components/games/snapie-blocks';

export default function SnapieBlocksPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const points = usePointsSummary(isLoggedIn ? username : null);

  if (!GAMES_FEATURE_FLAG) {
    return (
      <Box p={8} textAlign="center">
        <Heading>Snapie Blocks</Heading>
        <Text mt={4} color="fg.muted">
          Not available yet
        </Text>
      </Box>
    );
  }

  return (
    <VStack spacing={6} p={6} align="stretch" maxW="1000px" mx="auto">
      <HStack>
        <ChakraLink as={NextLink} href="/games" color="accent" display="flex" alignItems="center" gap={1}>
          <Text>← Back to Games</Text>
        </ChakraLink>
      </HStack>

      <VStack align="start" spacing={2}>
        <Heading size="lg">Snapie Blocks</Heading>
        <Text color="fg.muted">
          {isLoggedIn
            ? `Balance: ${points?.balance ?? '—'} Snapie Points. Wins pay out once, from the match.`
            : 'Open to guests. Log in if you want a win to pay Snapie Points.'}
        </Text>
      </VStack>

      <SnapieBlocksMatch username={isLoggedIn ? username : null} />
    </VStack>
  );
}
