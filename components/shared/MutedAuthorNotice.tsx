'use client';
import { Box, Button, Flex, Spinner, Text } from '@chakra-ui/react';

interface MutedAuthorNoticeProps {
  author: string;
  canUnmute: boolean;
  isRelationshipLoading: boolean;
  isProcessing: boolean;
  onUnmute: () => void;
}

export default function MutedAuthorNotice({
  author,
  canUnmute,
  isRelationshipLoading,
  isProcessing,
  onUnmute,
}: MutedAuthorNoticeProps) {
  return (
    <Flex direction="column" align="center" justify="center" minH="60vh" textAlign="center" px={4} gap={3}>
      <Text fontSize="lg" fontWeight="semibold" color="text">
        You&apos;ve muted @{author}
      </Text>
      <Text fontSize="sm" color="gray.500" maxW="sm">
        {canUnmute
          ? 'Their profile and posts are hidden because you muted them. Unmute to view this content again.'
          : 'This account has been muted in the Snapie community, so their content is hidden here.'}
      </Text>
      {isRelationshipLoading ? (
        <Spinner size="sm" color="primary" />
      ) : canUnmute ? (
        <Button size="sm" colorScheme="orange" onClick={onUnmute} isLoading={isProcessing}>
          Unmute @{author}
        </Button>
      ) : (
        <Box />
      )}
    </Flex>
  );
}
