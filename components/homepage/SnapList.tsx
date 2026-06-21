import React from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Box, Spinner, VStack, Text } from '@chakra-ui/react';
import Snap from './Snap';
import { ExtendedComment, useComments } from '@/hooks/useComments';
import { useSnaps } from '@/hooks/useSnaps';
import SnapComposer from './SnapComposer';

interface SnapListProps {
  author: string
  permlink: string
  setConversation: (conversation: ExtendedComment) => void;
  onOpen: () => void;
  setReply: (reply: ExtendedComment) => void;
  post?: boolean;
  data: InfiniteScrollData
  /** Shown when a completed fetch comes back with zero comments. Lets callers
   *  give a filter-specific message (e.g. the Patrons tab) instead of the
   *  generic default. */
  emptyMessage?: React.ReactNode
}

interface InfiniteScrollData {
  comments: ExtendedComment[];
  loadNextPage: () => void; // Default can be an empty function in usage
  isLoading: boolean;
  hasMore: boolean; // Default can be `false` in usage
  /** True once at least one fetch attempt has completed (success or error).
   *  Distinct from `hasMore` — a capped fetch can legitimately come back
   *  empty while `hasMore` is still true (more unscanned history exists),
   *  so the empty state can't rely on `!hasMore` alone anymore. */
  hasFetchedOnce?: boolean;
  refresh?: () => void; // Function to refresh the feed
}

export default function SnapList(
  {
    author,
    permlink,
    setConversation,
    onOpen,
    setReply,
    post,
    data,
    emptyMessage = 'No snaps yet.',
}: SnapListProps) {
  const { comments, loadNextPage, isLoading, hasMore, hasFetchedOnce, refresh } = data
  // Older data sources (useComments, useProfileSnaps) don't track this yet —
  // fall back to the previous "!hasMore means done" inference for them.
  const fetchComplete = hasFetchedOnce ?? !hasMore;

  const handleNewComment = () => {
    // Simple feed refresh after posting with delay for blockchain to catch up
    if (refresh) {
      setTimeout(() => {
        refresh();
      }, 3000); // 3 second delay to let Hive blockchain propagate the transaction
    }
  };

  comments.sort((a: ExtendedComment, b: ExtendedComment) => {
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  if (isLoading && comments.length === 0) {
    return (
      <Box textAlign="center" mt={4}>
        <Spinner size="xl" />
        <Text>Loading posts...</Text>
      </Box>
    );
  }

  if (!isLoading && fetchComplete && comments.length === 0) {
    return (
      <Box textAlign="center" mt={8} color="gray.500">
        <Text fontSize="lg">{emptyMessage}</Text>
      </Box>
    );
  }

  return (
        <InfiniteScroll
            dataLength={comments.length}
            next={loadNextPage}
            hasMore={hasMore}
            loader={
                (<Box display="flex" justifyContent="center" alignItems="center" py={5}>
                    <Spinner size="xl" color="primary" />
                </Box>
                )}
            scrollableTarget="scrollableDiv"
        >
          <VStack spacing={0} align="stretch" mx="auto" pt={0} px={{ base: 0, md: 2 }}>
          {!post && <Box id="snap-composer"><SnapComposer pa={author} pp={permlink} onNewComment={handleNewComment} onClose={() => null} /></Box>}
          {comments.map((comment: ExtendedComment) => (
            <Snap
              key={comment.permlink}
              comment={comment}
              onOpen={onOpen}
              setReply={setReply}
              {...(!post ? { setConversation } : {})}
            />
          ))}
          </VStack>
      </InfiniteScroll>

  );
}
