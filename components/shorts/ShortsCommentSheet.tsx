'use client';
import {
  Drawer, DrawerOverlay, DrawerContent, DrawerHeader,
  DrawerBody, DrawerCloseButton, Spinner, Text, VStack, Box, useDisclosure,
} from '@chakra-ui/react';
import { useComments, ExtendedComment } from '@/hooks/useComments';
import { useHiveUser } from '@/contexts/UserContext';
import Snap from '@/components/homepage/Snap';
import { useState } from 'react';
import SnapReplyModal from '@/components/homepage/SnapReplyModal';
import { Comment } from '@hiveio/dhive';

interface ShortsCommentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  author: string;
  permlink: string;
  commentCount: number;
}

export default function ShortsCommentSheet({
  isOpen,
  onClose,
  author,
  permlink,
  commentCount,
}: ShortsCommentSheetProps) {
  const { hiveUser } = useHiveUser();
  const { comments, isLoading, addComment } = useComments(author, permlink, true, hiveUser?.name);
  const [reply, setReply] = useState<Comment | null>(null);
  const { isOpen: replyOpen, onOpen: openReply, onClose: closeReply } = useDisclosure();

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} placement="bottom" size="full">
        <DrawerOverlay bg="blackAlpha.700" />
        <DrawerContent
          bg="rgba(8, 24, 40, 0.97)"
          borderTopRadius="16px"
          backdropFilter="blur(18px)"
          maxH="75dvh"
        >
          <DrawerCloseButton color="white" />
          <DrawerHeader
            fontSize="md"
            fontWeight="semibold"
            borderBottom="1px solid"
            borderColor="rgba(102, 228, 255, 0.12)"
            color="white"
          >
            {commentCount} Comments
          </DrawerHeader>
          <DrawerBody overflowY="auto" pb={8} px={2}>
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
          </DrawerBody>
          {reply && (
            <SnapReplyModal
              isOpen={replyOpen}
              onClose={closeReply}
              comment={reply}
              onNewReply={(newComment) => addComment(newComment as Comment)}
            />
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
