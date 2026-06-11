'use client';
import {
  Box, VStack, Text, Spinner, Flex, IconButton, useDisclosure,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { useComments, ExtendedComment } from '@/hooks/useComments';
import { useHiveUser } from '@/contexts/UserContext';
import Snap from '@/components/homepage/Snap';
import SnapReplyModal from '@/components/homepage/SnapReplyModal';
import SnapComposer from '@/components/homepage/SnapComposer';
import { useState } from 'react';
import { Comment } from '@hiveio/dhive';

interface ShortsCommentContentProps {
  author: string;
  permlink: string;
  commentCount: number;
  onClose: () => void;
}

export default function ShortsCommentContent({ author, permlink, commentCount, onClose }: ShortsCommentContentProps) {
  const { hiveUser } = useHiveUser();
  const { comments, isLoading, addComment } = useComments(author, permlink, true, hiveUser?.name);
  const [reply, setReply] = useState<Comment | null>(null);
  const { isOpen: replyOpen, onOpen: openReply, onClose: closeReply } = useDisclosure();

  return (
    <Flex direction="column" h="100%" overflow="hidden">
      {/* Header */}
      <Flex
        px={4}
        py={3}
        align="center"
        justify="space-between"
        borderBottom="1px solid"
        borderColor="rgba(102, 228, 255, 0.12)"
        flexShrink={0}
      >
        <Text fontSize="md" fontWeight="semibold" color="white">
          {commentCount} Comments
        </Text>
        <IconButton
          aria-label="Close comments"
          icon={<CloseIcon boxSize="10px" />}
          size="sm"
          variant="ghost"
          color="white"
          _hover={{ bg: 'whiteAlpha.100' }}
          onClick={onClose}
        />
      </Flex>

      {/* Comment list */}
      <Box flex={1} overflowY="auto" px={2} py={2}>
        {isLoading ? (
          <Box textAlign="center" py={10}>
            <Spinner color="blue.300" size="lg" />
          </Box>
        ) : comments.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={10} fontSize="sm">
            No comments yet. Be the first!
          </Text>
        ) : (
          <VStack spacing={1} align="stretch">
            {(comments as ExtendedComment[]).map((c) => (
              <Snap
                key={`${c.author}/${c.permlink}`}
                comment={c}
                onOpen={openReply}
                setReply={(r) => setReply(r as Comment)}
              />
            ))}
          </VStack>
        )}
      </Box>

      {/* Compose — posts a top-level comment on the short */}
      <Box
        flexShrink={0}
        borderTop="1px solid"
        borderColor="rgba(102, 228, 255, 0.12)"
        px={3}
        py={3}
      >
        <SnapComposer
          pa={author}
          pp={permlink}
          onNewComment={(c) => addComment(c as Comment)}
          post={false}
          onClose={() => {}}
        />
      </Box>

      {/* Reply-to-comment modal */}
      {reply && (
        <SnapReplyModal
          isOpen={replyOpen}
          onClose={closeReply}
          comment={reply}
          onNewReply={(c) => addComment(c as Comment)}
        />
      )}
    </Flex>
  );
}
