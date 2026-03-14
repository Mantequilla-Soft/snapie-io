import { Box, Text, HStack, Button, Avatar, Divider, VStack, Spinner } from '@chakra-ui/react';
import { Comment } from '@hiveio/dhive';
import { useComments } from '@/hooks/useComments';
import { useHiveUser } from '@/contexts/UserContext';
import { ArrowBackIcon } from "@chakra-ui/icons";
import Snap from './Snap';

interface ConversationProps {
    comment: Comment;
    setConversation: (conversation: Comment | undefined) => void;
    onOpen: () => void;
    setReply: (reply: Comment) => void;
}

const Conversation = ({ comment, setConversation, onOpen, setReply }: ConversationProps) => {
    const { hiveUser } = useHiveUser();
    const { comments, isLoading, error } = useComments(comment.author, comment.permlink, true, hiveUser?.name);
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
