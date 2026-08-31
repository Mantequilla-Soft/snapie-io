import { Box, Text, Button, CloseButton, Flex } from '@chakra-ui/react';
import NextLink from 'next/link';
import type { UseToastOptions } from '@chakra-ui/react';

/** Shared "not enough points" toast for every points-spend flow (Mood
 *  Badges, Roulette, The Pile's buy/create/anon-throw) — a plain warning
 *  toast used to be a dead end; this one reminds people points can be
 *  earned by using the app OR bought outright, with a direct link, instead
 *  of just saying no. Pass to `toast(...)` in place of the old
 *  `{status:'warning', title:'Not enough points', description:...}` shape. */
export function notEnoughPointsToast(needed: number, context?: string): UseToastOptions {
  return {
    status: 'warning',
    duration: 8000,
    isClosable: true,
    position: 'top',
    render: ({ onClose }) => (
      <Box bg="orange.500" color="white" borderRadius="md" px={4} py={3} boxShadow="lg">
        <Flex justify="space-between" align="flex-start" gap={2}>
          <Box>
            <Text fontWeight="bold" fontSize="sm">Not enough points</Text>
            <Text fontSize="xs" opacity={0.92} mt={0.5}>
              {context ? `${context} costs ${needed.toLocaleString()}` : `You need ${needed.toLocaleString()}`} points.
              Earn more by snapping, voting, and commenting — or just buy some.
            </Text>
            <Button
              as={NextLink}
              href="/settings/points/buy"
              size="xs"
              mt={2}
              bg="white"
              color="orange.600"
              _hover={{ bg: 'whiteAlpha.900' }}
              onClick={onClose}
            >
              Buy Points
            </Button>
          </Box>
          <CloseButton size="sm" onClick={onClose} />
        </Flex>
      </Box>
    ),
  };
}
