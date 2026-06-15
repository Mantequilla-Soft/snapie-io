'use client';

import { useEffect } from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error?.name === 'ChunkLoadError') {
      window.location.reload();
    }
  }, [error]);

  return (
    <Flex minH="60vh" align="center" justify="center" p={8}>
      <Box textAlign="center" maxW="400px">
        <Text fontSize="xl" fontWeight="bold" mb={2}>Something went wrong</Text>
        <Text fontSize="sm" opacity={0.6} mb={6}>
          {error?.message || 'An unexpected error occurred.'}
        </Text>
        <Button onClick={reset} size="sm">Try again</Button>
      </Box>
    </Flex>
  );
}
