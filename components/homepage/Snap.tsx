import { Box, Text, HStack, Button, Avatar, Link, VStack, Flex, Slider, SliderTrack, SliderFilledTrack, SliderThumb, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea, useToast } from '@chakra-ui/react';
import { Comment } from '@hiveio/dhive';
import { ExtendedComment } from '@/hooks/useComments';
import { FaRegComment, FaRegHeart, FaShare, FaHeart, FaEdit, FaRetweet } from "react-icons/fa";
import { useKeychain } from '@/contexts/KeychainContext';
import { useState, useMemo, memo, useCallback } from 'react';
import { getPostDate } from '@/lib/utils/GetPostDate';
import { separateContent, extractHivePostUrls } from '@/lib/utils/snapUtils';
import MediaRenderer from '@/components/shared/MediaRenderer';
import HivePostPreview from '@/components/shared/HivePostPreview';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { useCurrencyDisplay } from '@/hooks/useCurrencyDisplay';
import { vote, commentWithKeychain } from '@/lib/hive/client-functions';
import NextLink from 'next/link';

interface SnapProps {
    comment: ExtendedComment;
    onOpen: () => void;
    setReply: (comment: Comment) => void;
    setConversation?: (conversation: Comment) => void;
    level?: number; // Added level for indentation
}

const Snap = memo(({ comment, onOpen, setReply, setConversation, level = 0 }: SnapProps) => {
    const commentDate = getPostDate(comment.created);
    const { user } = useKeychain();
    const [voted, setVoted] = useState(comment.active_votes?.some(item => item.voter === user))
    const [voteCount, setVoteCount] = useState(comment.active_votes?.length || 0);
    const [sliderValue, setSliderValue] = useState(5);
    const [showSlider, setShowSlider] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editedBody, setEditedBody] = useState(comment.body);
    const [isEditing, setIsEditing] = useState(false);
    const payoutDisplay = useCurrencyDisplay(comment);
    const toast = useToast();
    
    // Check if user can edit (is author and post is less than 7 days old)
    const canEdit = useMemo(() => {
        if (!user || user !== comment.author) return false;
        const postAge = Date.now() - new Date(comment.created).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        return postAge < sevenDays;
    }, [user, comment.author, comment.created]);

    // Extract Hive post URLs for preview cards
    const hivePostUrls = useMemo(
        () => extractHivePostUrls(comment.body),
        [comment.body]
    );

    // Separate media from text using SkateHive's pattern
    const { text, media } = useMemo(
        () => separateContent(comment.body),
        [comment.body]
    );

    // Remove Hive post URLs from text since we'll render them as preview cards
    const textWithoutHiveUrls = useMemo(() => {
        let cleanText = text;
        hivePostUrls.forEach(({ url }) => {
            cleanText = cleanText.replace(url, '');
        });
        return cleanText.trim();
    }, [text, hivePostUrls]);

    // Render text as HTML using markdown renderer
    const renderedText = useMemo(
        () => textWithoutHiveUrls ? markdownRenderer(textWithoutHiveUrls, { defaultEmojiOwner: comment.author }) : '',
        [textWithoutHiveUrls, comment.author]
    );

    const replies = comment.replies;

    // Memoize the MediaRenderer to prevent re-renders when state changes
    const memoizedMediaRenderer = useMemo(() => {
        if (!media) return null;
        return <MediaRenderer mediaContent={media} />;
    }, [media]);

    function handleHeartClick() {
        setShowSlider(!showSlider);
    }

    function handleReplyModal() {
        setReply(comment);
        onOpen();
    }

    function handleConversation() {
        if (setConversation) setConversation(comment);
    }

    async function handleVote() {
        // Optimistic update
        const wasVoted = voted;
        const previousCount = voteCount;
        
        setVoted(true);
        setVoteCount(prev => prev + 1);
        handleHeartClick();
        
        // Send to blockchain
        try {
            if (!user) {
                throw new Error('Please log in to vote');
            }
            
            const voteResult = await vote({
                username: user,
                author: comment.author,
                permlink: comment.permlink,
                weight: sliderValue * 100
            });
            
            if (!voteResult.success) {
                // Rollback on failure
                setVoted(wasVoted);
                setVoteCount(previousCount);
                toast({
                    title: 'Vote Failed',
                    description: 'Failed to vote. Please try again.',
                    status: 'error',
                    duration: 3000,
                });
            }
        } catch (error) {
            // Rollback on error
            setVoted(wasVoted);
            setVoteCount(previousCount);
            toast({
                title: 'Vote Failed',
                description: 'An error occurred. Please try again.',
                status: 'error',
                duration: 3000,
            });
        }
    }

    function handleReSnap() {
        // Copy snap URL to clipboard for easy sharing
        const snapUrl = `${window.location.origin}/@${comment.author}/${comment.permlink}`;
        navigator.clipboard.writeText(snapUrl);
        toast({
            title: 'Link Copied!',
            description: 'Snap link copied to clipboard. Paste it in a new snap to re-snap!',
            status: 'success',
            duration: 3000,
        });
    }

    async function handleEditPost() {
        if (!user || !editedBody.trim()) return;
        
        setIsEditing(true);
        try {
            // Parse existing metadata
            const metadata = comment.json_metadata ? JSON.parse(comment.json_metadata) : {};
            
            // Edit is same as comment but with same permlink
            const response = await commentWithKeychain({
                data: {
                    username: user,
                    parent_username: comment.parent_author,
                    parent_perm: comment.parent_permlink,
                    permlink: comment.permlink,
                    title: comment.title || '',
                    body: editedBody,
                    json_metadata: JSON.stringify(metadata),
                    comment_options: ''
                }
            });
            
            if (response && response.success) {
                toast({
                    title: 'Post Updated',
                    description: 'Your post has been updated successfully!',
                    status: 'success',
                    duration: 3000,
                });
                setIsEditModalOpen(false);
                // Update comment body locally
                comment.body = editedBody;
            } else {
                const errorMsg = (response as any)?.error || 'Edit failed';
                throw new Error(errorMsg);
            }
        } catch (error: any) {
            console.error('Error editing post:', error);
            const errorMessage = error?.message || error?.error || 'Unknown error';
            toast({
                title: 'Edit Failed',
                description: `Failed to update post: ${errorMessage}`,
                status: 'error',
                duration: 5000,
            });
        } finally {
            setIsEditing(false);
        }
    }
    return (
        <Box pl={level > 0 ? 1 : 0} ml={level > 0 ? 2 : 0}>
            <Box
                bg="muted"
                p={4}
                mt={1}
                mb={1}
                border="tb1"
                borderRadius="base"  // This will apply the borderRadius from your theme
                width="100%"
            >
                <HStack mb={2}>
                    <Avatar 
                        size="sm" 
                        name={comment.author} 
                        src={`https://images.hive.blog/u/${comment.author}/avatar/sm`}
                    />
                    <Box ml={3}>
                        <Text fontWeight="medium" fontSize="sm">
                            <Link as={NextLink} href={`/@${comment.author}`}>@{comment.author}</Link>
                        </Text>
                        <Text fontWeight="medium" fontSize="sm" color="primary">
                            {commentDate}
                        </Text>
                    </Box>
                </HStack>
                
                {/* Render media separately using MediaRenderer */}
                {memoizedMediaRenderer}
                
                {/* Render text content with proper markdown processing - clickable to open full post */}
                {renderedText && (
                    <Box 
                        dangerouslySetInnerHTML={{ __html: renderedText }}
                        onClick={setConversation ? handleConversation : undefined}
                        cursor={setConversation ? "pointer" : "default"}
                        sx={{
                            "& p": { marginBottom: 2 },
                            "& a": { 
                                color: "primary", 
                                textDecoration: "underline",
                                cursor: "pointer",
                                _hover: {
                                    color: "accent"
                                }
                            }
                        }}
                    />
                )}

                {/* Render Hive post preview cards */}
                {hivePostUrls.length > 0 && (
                    <VStack spacing={2} align="stretch" mt={2}>
                        {hivePostUrls.map(({ author, permlink }, index) => (
                            <HivePostPreview
                                key={`${author}-${permlink}-${index}`}
                                author={author}
                                permlink={permlink}
                            />
                        ))}
                    </VStack>
                )}
                
                {showSlider ? (
                <Flex mt={4} alignItems="center">
                    <Box width="100%" mr={2}>
                        <Slider
                            aria-label="slider-ex-1"
                            min={0}
                            max={100}
                            value={sliderValue}
                            onChange={(val) => setSliderValue(val)}
                        >
                            <SliderTrack>
                                <SliderFilledTrack />
                            </SliderTrack>
                            <SliderThumb />
                        </Slider>
                    </Box>
                    <Button size="xs" onClick={handleVote}>&nbsp;&nbsp;&nbsp;Vote {sliderValue} %&nbsp;&nbsp;&nbsp;</Button>
                    <Button size="xs" onClick={handleHeartClick} ml={2}>X</Button>

                </Flex>
            ) : (
                <HStack justify="space-between" mt={3}>
                    <Button leftIcon={voted ? (<FaHeart />) : (<FaRegHeart />)} variant="ghost" onClick={handleHeartClick}>
                        {voteCount}
                    </Button>
                    <HStack spacing={4}>
                        {/* Reply button - opens reply modal */}
                        <HStack spacing={1} cursor="pointer" onClick={handleReplyModal}>
                            <FaRegComment />
                        </HStack>
                        {/* View conversation button - opens full post with all comments */}
                        {setConversation && (
                            <Text fontWeight="bold" cursor="pointer" onClick={handleConversation}>
                                {comment.children}
                            </Text>
                        )}
                        <HStack spacing={1} cursor="pointer" onClick={handleReSnap}>
                            <FaRetweet />
                            <Text fontSize="sm">Re-Snap/Share</Text>
                        </HStack>
                        {canEdit && (
                            <HStack spacing={1} cursor="pointer" onClick={() => setIsEditModalOpen(true)}>
                                <FaEdit />
                                <Text fontSize="sm">Edit</Text>
                            </HStack>
                        )}
                    </HStack>
                    <Text fontWeight="bold" fontSize="sm">
                        {payoutDisplay}
                    </Text>
                </HStack>
            )}
            </Box>
            
            {/* Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} size="xl">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Edit Post</ModalHeader>
                    <ModalBody>
                        <Textarea
                            value={editedBody}
                            onChange={(e) => setEditedBody(e.target.value)}
                            placeholder="Edit your post..."
                            rows={10}
                            bg="background"
                            border="tb1"
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={() => setIsEditModalOpen(false)} isDisabled={isEditing}>
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={handleEditPost}
                            isLoading={isEditing}
                            loadingText="Updating..."
                        >
                            Update
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            
            {/* Render replies recursively */}
            {replies && replies.length > 0 && (
                <VStack spacing={2} align="stretch" mt={2}>
                    {replies.map((reply: Comment) => (
                        <Snap
                            key={reply.permlink}
                            comment={reply}
                            onOpen={onOpen}
                            setReply={setReply}
                            setConversation={setConversation}
                            level={level + 1} // Increment level for indentation
                        />
                    ))}
                </VStack>
            )}
        </Box>
    );
}, (prevProps, nextProps) => {
    // Only re-render if the comment permlink or active_votes length changes
    return (
        prevProps.comment.permlink === nextProps.comment.permlink &&
        prevProps.comment.active_votes?.length === nextProps.comment.active_votes?.length &&
        prevProps.level === nextProps.level
    );
});

Snap.displayName = 'Snap';

export default Snap;
