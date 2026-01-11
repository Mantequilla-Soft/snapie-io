// app/page.tsx
'use client';

import { Box, Container, Flex, Spinner } from '@chakra-ui/react';
import SnapList from '../homepage/SnapList';
import SnapComposer from '../homepage/SnapComposer';
import { useEffect, useState } from 'react';
import { Comment, Discussion } from '@hiveio/dhive'; // Ensure this import is consistent
import Conversation from '../homepage/Conversation';
import SnapReplyModal from '../homepage/SnapReplyModal';
import { getPost } from '@/lib/hive/client-functions';
import PostDetails from '@/components/blog/PostDetails';
import { useComments } from '@/hooks/useComments';
import { useSearchParams } from 'next/navigation';

interface PostPageProps {
  author: string
  permlink: string
}

export default function PostPage({ author, permlink }: PostPageProps) {
  const searchParams = useSearchParams();
  const isEmbedMode = searchParams.get('embed') === 'true';

  const [isLoading, setIsLoading] = useState(false);
  const [post, setPost] = useState<Discussion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Comment | undefined>();
  const [reply, setReply] = useState<Comment>();
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState<Comment | null>(null); // Define the state

  // Only fetch comments if NOT in embed mode
  const data = useComments(isEmbedMode ? '' : author, isEmbedMode ? '' : permlink, !isEmbedMode);
  const commentsData = {
    ...data, 
    loadNextPage: () => {}, 
    hasMore: false,         
  };

  useEffect(() => {
    async function loadPost() {
      setIsLoading(true);
      try {
        const post = await getPost(author, permlink);
        setPost(post);
      } catch (err) {
        setError('Failed to load post');
      } finally {
        setIsLoading(false);
      }
    }

    loadPost();
  }, [author, permlink]);

  const onOpen = () => setIsOpen(true);
  const onClose = () => setIsOpen(false);

  const handleNewComment = (newComment: Partial<Comment> | CharacterData) => {
    setNewComment(newComment as Comment); // Type assertion
  };

  if (isLoading || (!post || !author || !permlink)) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Spinner size="xl" color="primary" />
      </Box>
    );
  }

  return (
    <Box bg="background" color="text" minH="100vh">
      <Flex direction={{ base: 'column', md: 'row' }}>
        <Box flex="1" p={isEmbedMode ? 2 : 4}>
          <Container maxW={isEmbedMode ? '100%' : 'container.sm'} p={isEmbedMode ? 0 : undefined}>
            <PostDetails post={post} isEmbedMode={isEmbedMode} />
            {!isEmbedMode && !conversation ? (
              <>
                <SnapComposer pa={author} pp={permlink} onNewComment={handleNewComment} post={true} onClose={() => {}} />
                <SnapList
                  author={author}
                  permlink={permlink}
                  setConversation={setConversation}
                  onOpen={onOpen}
                  setReply={setReply}
                  newComment={newComment} // Pass the newComment to SnapList
                  post={true}
                  data={commentsData}
                />
              </>
            ) : !isEmbedMode && conversation ? (
              <Conversation comment={conversation} setConversation={setConversation} onOpen={onOpen} setReply={setReply} />
            ) : null}
          </Container>
        </Box>
      </Flex>
      {!isEmbedMode && isOpen && <SnapReplyModal isOpen={isOpen} onClose={onClose} comment={reply} onNewReply={handleNewComment} />}
    </Box>
  );
}
