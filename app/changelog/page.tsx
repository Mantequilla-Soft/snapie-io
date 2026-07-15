'use client';
import { Box, Heading, Text } from '@chakra-ui/react';
import { CHANGELOG } from '@/lib/changelog';
import ChangelogEntries from '@/components/changelog/ChangelogEntries';

export default function ChangelogPage() {
  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        What&apos;s new
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={8}>
        Everything we&apos;ve shipped, newest first.
      </Text>

      <Box
        bg="surface"
        borderRadius="16px"
        border="1px solid"
        borderColor="surfaceBorder"
        backdropFilter="blur(18px)"
        overflow="hidden"
      >
        <Box px={6} py={6}>
          {CHANGELOG.length > 0 ? (
            <ChangelogEntries entries={CHANGELOG} />
          ) : (
            <Text color="overlay.500" fontSize="sm">
              No updates yet — check back soon.
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
