import { Box, Text, HStack, Button, Avatar, Divider, VStack, Spinner } from '@chakra-ui/react';
import { Comment } from '@hiveio/dhive';
import { useComments } from '@/hooks/useComments';
import { useHiveUser } from '@/contexts/UserContext';
import { ArrowBackIcon, ArrowUpIcon } from "@chakra-ui/icons";
import Snap from './Snap';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ConversationProps {
    comment: Comment;
    setConversation: (conversation: Comment | undefined) => void;
    onOpen: () => void;
    setReply: (reply: Comment) => void;
    refreshTrigger?: number;
}

const Conversation = ({ comment, setConversation, onOpen, setReply, refreshTrigger }: ConversationProps) => {
    const { hiveUser } = useHiveUser();
    const router = useRouter();
    const { comments, isLoading, error, updateComments } = useComments(comment.author, comment.permlink, true, hiveUser?.name);
    const isTopLevel = !comment.parent_author || comment.parent_author === 'peak.snaps';

    useEffect(() => {
        if (refreshTrigger && refreshTrigger > 0) updateComments();
    }, [refreshTrigger]);
    const replies = comments

    function handleReplyModal() {
        setReply(comment);
        onOpen();
    }

    function onBackClick() {
        setConversation(undefined)
    }

    if (isLoading) {
        return (
            <Box textAlign="center" mt={4}>
                <Spinner size="xl" />
                <Text>Loading snaps...</Text>
            </Box>
        );
    }

    return (
        <Box bg="muted" p={4} mt={1} mb={1} borderRadius="base" border="tb1" boxShadow="lg">
            <HStack mb={4} spacing={2}>
                <Button onClick={onBackClick} variant="ghost" leftIcon={<ArrowBackIcon />}></Button>
                <Text fontSize="lg" fontWeight="bold">Conversation</Text>
            </HStack>
            {!isTopLevel && (
                <HStack
                    mb={2}
                    px={1}
                    spacing={1}
                    fontSize="sm"
                    color="gray.500"
                    cursor="pointer"
                    _hover={{ color: 'primary' }}
                    onClick={() => router.push(`/@${comment.parent_author}/${comment.parent_permlink}`)}
                >
                    <ArrowUpIcon boxSize={3} />
                    <Text>Replying to @{comment.parent_author}</Text>
                </HStack>
            )}
            <Snap comment={comment} onOpen={onOpen} setReply={setReply} />
            <Divider my={4} />
            <HStack justify="space-between" mt={3} onClick={handleReplyModal}>
                <HStack>
                    <Avatar size="sm" name="Your Name" />
                    <Text>Snap your reply</Text>
                </HStack>
                <Button variant="solid" colorScheme="primary" onClick={handleReplyModal}>
                    Reply
                </Button>
            </HStack>
            <Divider my={4} />
            <VStack spacing={2} align="stretch">
                {replies.map((reply: any) => (
                    <Snap key={reply.permlink} comment={reply} onOpen={onOpen} setReply={setReply} />
                ))}
            </VStack>
        </Box>
    );
}

export default Conversation;
