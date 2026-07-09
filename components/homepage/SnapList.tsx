import React, { useState } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Box, Button, HStack, Spinner, VStack, Text } from '@chakra-ui/react';
import Snap from './Snap';
import { ExtendedComment, useComments } from '@/hooks/useComments';
import { useSnaps } from '@/hooks/useSnaps';
import SnapComposer from './SnapComposer';
import { getPayoutValue } from '@/lib/hive/client-functions';
import { interleaveCandidates } from '@/lib/discovery/interleave';

type SortOrder = 'new' | 'top';

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
  /** Discovery Engine Phase 1 — optional, undefined/empty changes nothing for
   *  any existing caller. Spliced in after sorting, only when sortOrder is
   *  'new' — see the interleave call below for why. */
  discoveryItems?: ExtendedComment[]
  discoveryEveryN?: number
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
    discoveryItems,
    discoveryEveryN = 5,
}: SnapListProps) {
  const { comments, loadNextPage, isLoading, hasMore, hasFetchedOnce, refresh } = data
  // Older data sources (useComments, useProfileSnaps) don't track this yet —
  // fall back to the previous "!hasMore means done" inference for them.
  const fetchComplete = hasFetchedOnce ?? !hasMore;
  const [sortOrder, setSortOrder] = useState<SortOrder>('new');

  const handleNewComment = () => {
    // Simple feed refresh after posting with delay for blockchain to catch up
    if (refresh) {
      setTimeout(() => {
        refresh();
      }, 3000); // 3 second delay to let Hive blockchain propagate the transaction
    }
  };

  comments.sort((a: ExtendedComment, b: ExtendedComment) => {
    if (sortOrder === 'top') {
      return parseFloat(getPayoutValue(b)) - parseFloat(getPayoutValue(a));
    }
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  // Discovery candidates only make sense against the chronological view —
  // 'top' is an explicit request for payout ranking, and injecting
  // engagement-ranked items there would contradict what the user just asked
  // for. Must happen after the sort above, not before — comments.sort()
  // mutates in place and re-runs on every render, so anything spliced in
  // upstream of it would just get reshuffled back out.
  const displayComments = (discoveryItems?.length && sortOrder === 'new')
    ? interleaveCandidates(comments, discoveryItems, discoveryEveryN)
    : comments;

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
            dataLength={displayComments.length}
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
          {post && comments.length > 1 && (
              <HStack spacing={2} px={2} pt={3} pb={1}>
                  {(['new', 'top'] as const).map(opt => (
                      <Button
                          key={opt}
                          size="sm"
                          variant="ghost"
                          borderRadius="full"
                          bg={sortOrder === opt ? 'muted' : 'transparent'}
                          color={sortOrder === opt ? 'text' : 'gray.500'}
                          borderWidth="1px"
                          borderColor={sortOrder === opt ? 'primary' : 'border'}
                          _hover={{ bg: 'muted', color: 'text' }}
                          onClick={() => setSortOrder(opt)}
                      >
                          {opt === 'new' ? '✨ New' : '💰 Top'}
                      </Button>
                  ))}
              </HStack>
          )}
          {displayComments.map((comment: ExtendedComment) => (
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
