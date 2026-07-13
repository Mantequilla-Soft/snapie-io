import { Box, Text, HStack, Button, Avatar, Link, VStack, Flex, Wrap, WrapItem, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea, Spinner, useToast } from '@chakra-ui/react';
import { Comment } from '@hiveio/dhive';
import { ExtendedComment } from '@/hooks/useComments';
import { FaRegComment, FaRegHeart, FaShare, FaHeart, FaEdit, FaRetweet } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { MdTranslate } from "react-icons/md";
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useState, useMemo, memo, useCallback } from 'react';
import { getPostDate } from '@/lib/utils/GetPostDate';
import { separateContent, extractHivePostUrls, extractHangoutUrls } from '@/lib/utils/snapUtils';
import { detectLang } from '@/lib/utils/detectLanguage';
import MediaRenderer from '@/components/shared/MediaRenderer';
import HivePostPreview from '@/components/shared/HivePostPreview';
import HangoutPreviewCard from '@/components/hangouts/HangoutPreviewCard';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { useCurrencyDisplay } from '@/hooks/useCurrencyDisplay';
import { useVoteCalculator } from '@/hooks/useVoteCalculator';
import { vote, commentWithKeychain } from '@/lib/hive/client-functions';
import NextLink from 'next/link';
import VoteControls from './VoteSlider';
import PatronBadge from '@/components/shared/PatronBadge';
import WaveBadge from '@/components/shared/WaveBadge';
import TrendingBadge from '@/components/shared/TrendingBadge';
import SnapieCommunityBadge from '@/components/shared/SnapieCommunityBadge';
import VaultBadge from '@/components/shared/VaultBadge';
import { isSnapieCommunityPost } from '@/lib/discovery/snapTrending';
import { usePatronStatus } from '@/hooks/usePatronStatus';
import { useCombflowPost } from '@/hooks/useCombflowPost';
import { translationCache } from '@/lib/utils/translationCache';

// Deeper replies than this render flush with their ancestor instead of
// indenting further — unbounded nesting crushes the card width on mobile.
const MAX_INDENT_LEVEL = 3;

interface SnapProps {
    comment: ExtendedComment;
    onOpen: () => void;
    setReply: (comment: Comment) => void;
    setConversation?: (conversation: Comment) => void;
    level?: number; // Added level for indentation
}

const Snap = memo(({ comment, onOpen, setReply, setConversation, level = 0 }: SnapProps) => {
    const commentDate = getPostDate(comment.created);
    const { username: user } = useCurrentUser();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editedBody, setEditedBody] = useState(comment.body);
    const [isEditing, setIsEditing] = useState(false);
    const [optimisticDeltaHBD, setOptimisticDeltaHBD] = useState(0);
    const [translatedText, setTranslatedText] = useState<string | null>(
        () => translationCache.get(comment.permlink) ?? null
    );
    const [isTranslating, setIsTranslating] = useState(false);
    const [nsfwRevealed, setNsfwRevealed] = useState(false);
    const { postData } = useCombflowPost(comment.author, comment.permlink, false);
    const { calculateDelta } = useVoteCalculator(user ?? null);
    const { getTier } = usePatronStatus();
    const payoutDisplay = useCurrencyDisplay(comment, optimisticDeltaHBD);
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

    // Extract hangout room names for preview cards
    const hangoutRoomNames = useMemo(
        () => extractHangoutUrls(comment.body),
        [comment.body]
    );

    // Separate media from text using SkateHive's pattern
    const { text, media } = useMemo(
        () => separateContent(comment.body),
        [comment.body]
    );

    // Remove Hive post URLs and hangout URLs from text since we'll render them as preview cards
    const textWithoutHiveUrls = useMemo(() => {
        let cleanText = text;
        hivePostUrls.forEach(({ url }) => {
            cleanText = cleanText.replace(url, '');
        });
        hangoutRoomNames.forEach((roomName) => {
            cleanText = cleanText.replace(
                new RegExp(`https?://hangout\\.3speak\\.tv/room/${roomName}`, 'g'),
                ''
            );
        });
        return cleanText.trim();
    }, [text, hivePostUrls, hangoutRoomNames]);

    // Render text as HTML using markdown renderer
    const renderedText = useMemo(
        () => textWithoutHiveUrls ? markdownRenderer(textWithoutHiveUrls, { defaultEmojiOwner: comment.author }) : '',
        [textWithoutHiveUrls, comment.author]
    );

    const browserLang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
    const detectedLang = useMemo(() => detectLang(text), [text]);
    // Show translate when: we detected a language and it differs from the browser's,
    // OR the text is too short/ambiguous to detect (detectedLang === null) — offer it anyway.
    // Hides the button when the snap is confidently the same language as the browser.
    const showTranslate = !!text && !translatedText && (detectedLang === null || detectedLang !== browserLang);
    const isNsfw = postData?.is_nsfw ?? false;

    const replies = comment.replies;

    function handleReplyModal() {
        setReply(comment);
        onOpen();
    }

    function handleConversation() {
        if (setConversation) setConversation(comment);
    }

    async function handleVote(weight: number) {
        if (!user) {
            throw new Error('Please log in to vote');
        }
        
        const voteResult = await vote({
            username: user,
            author: comment.author,
            permlink: comment.permlink,
            weight: weight * 100
        });
        
        return voteResult;
    }

    function handleShareOnX() {
        const snapUrl = `${window.location.origin}/@${comment.author}/${comment.permlink}`;
        const tweet = `${snapUrl}\n\nCrossposted from snapie.io`;
        window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank', 'noopener,noreferrer');
    }

    async function handleTranslate() {
        if (isTranslating || !text) return;
        setIsTranslating(true);
        try {
            const targetLang = navigator.language.split('-')[0];
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, targetLang }),
            });
            const data = await res.json();
            if (data.translatedText) {
                translationCache.set(comment.permlink, data.translatedText);
                setTranslatedText(data.translatedText);
            } else {
                toast({ title: 'Translation failed', description: data.error ?? 'Could not translate.', status: 'error', duration: 3000 });
            }
        } catch {
            toast({ title: 'Translation failed', description: 'Could not reach the translation service.', status: 'error', duration: 3000 });
        } finally {
            setIsTranslating(false);
        }
    }

    function handleReSnap() {
        const snapUrl = `${window.location.origin}/@${comment.author}/${comment.permlink}`;
        navigator.clipboard.writeText(snapUrl);
        document.dispatchEvent(new CustomEvent('resnap', { detail: { url: snapUrl } }));
        document.getElementById('snap-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast({
            title: 'Re-Snap',
            description: 'Link added to your composer — add a comment and hit Post!',
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
        <Box pl={level > 0 && level <= MAX_INDENT_LEVEL ? 1 : 0} ml={level > 0 && level <= MAX_INDENT_LEVEL ? 2 : 0}>
            <Box
                bg="surface"
                px={4}
                pt={4}
                pb={3}
                mt={3}
                mb={3}
                border="tb1"
                borderRadius="10px"
                width="100%"
                boxShadow="md"
                backdropFilter="blur(16px)"
                transition="all 0.18s ease"
                _hover={{
                    borderColor: 'rgba(28, 161, 241, 0.34)',
                    boxShadow: 'lg',
                    transform: 'translateY(-1px)',
                }}
            >
                <Flex gap={3} align="flex-start">
                    {/* Left column: avatar */}
                    <Avatar
                        size="sm"
                        w="36px"
                        h="36px"
                        name={comment.author}
                        src={`https://images.hive.blog/u/${comment.author}/avatar/sm`}
                        flexShrink={0}
                        mt="-2px"
                    />

                    {/* Right column: header + content + actions */}
                    <Box flex={1} minW={0} pt="4px">
                        {/* Header row: name · date, badges wrap to their own line if they don't fit */}
                        <Flex align="flex-start" justify="space-between" mb={1}>
                            <Wrap spacing={1} align="center" flex={1} minW={0}>
                                <WrapItem>
                                    <HStack spacing={1}>
                                        <Link
                                            as={NextLink}
                                            href={`/@${comment.author}`}
                                            fontWeight="semibold"
                                            fontSize="sm"
                                            noOfLines={1}
                                            _hover={{ color: 'primary' }}
                                        >
                                            @{comment.author}
                                        </Link>
                                        <Text fontSize="sm" color="overlay.400" flexShrink={0}>·</Text>
                                        <Text fontSize="sm" color="overlay.500" flexShrink={0}>{commentDate}</Text>
                                    </HStack>
                                </WrapItem>
                                {getTier(comment.author) && <WrapItem><PatronBadge tier={getTier(comment.author)} /></WrapItem>}
                                {comment.source === 'wave' && <WrapItem><WaveBadge /></WrapItem>}
                                {comment.isDiscovery && comment.discoveryReason === 'trending' && <WrapItem><TrendingBadge /></WrapItem>}
                                {comment.isDiscovery && comment.discoveryReason === 'resurrected' && <WrapItem><VaultBadge /></WrapItem>}
                                {isSnapieCommunityPost(comment) && <WrapItem><SnapieCommunityBadge /></WrapItem>}
                            </Wrap>
                            {canEdit && (
                                <Box
                                    as="button"
                                    onClick={() => setIsEditModalOpen(true)}
                                    color="overlay.400"
                                    _hover={{ color: 'text' }}
                                    flexShrink={0}
                                    ml={2}
                                    aria-label="Edit post"
                                >
                                    <FaEdit size={12} />
                                </Box>
                            )}
                        </Flex>

                        {/* NSFW gate */}
                        {isNsfw && !nsfwRevealed ? (
                            <Flex
                                direction="column"
                                align="center"
                                justify="center"
                                gap={2}
                                py={6}
                                my={2}
                                borderRadius="md"
                                border="1px solid rgba(251,191,36,0.2)"
                                bg="rgba(251,191,36,0.04)"
                            >
                                <Text fontSize="lg">⚠️</Text>
                                <Text fontSize="sm" color="yellow.300" fontWeight="semibold">Sensitive content</Text>
                                <Box
                                    as="button"
                                    fontSize="xs"
                                    color="overlay.500"
                                    _hover={{ color: 'primary' }}
                                    onClick={() => setNsfwRevealed(true)}
                                >
                                    Show anyway
                                </Box>
                            </Flex>
                        ) : (
                            <>
                        {/* Media */}
                        {media && <MediaRenderer key={`media-${comment.permlink}`} mediaContent={media} />}

                        {/* Text content */}
                        {translatedText ? (
                            <Box mb={2}>
                                <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word">{translatedText}</Text>
                                <Text
                                    as="button"
                                    fontSize="xs"
                                    color="gray.500"
                                    mt={1}
                                    _hover={{ color: 'primary' }}
                                    onClick={() => { translationCache.delete(comment.permlink); setTranslatedText(null); }}
                                >
                                    Show original
                                </Text>
                            </Box>
                        ) : (
                            <>
                                {renderedText && (
                                    <Box
                                        overflowX="hidden"
                                        wordBreak="break-word"
                                        dangerouslySetInnerHTML={{ __html: renderedText }}
                                        onClick={setConversation ? handleConversation : undefined}
                                        cursor={setConversation ? 'pointer' : 'default'}
                                        mb={1}
                                        sx={{
                                            '& p': { marginBottom: 2 },
                                            '& a': {
                                                color: 'primary',
                                                textDecoration: 'underline',
                                                cursor: 'pointer',
                                                _hover: { color: 'accent' },
                                            },
                                            '& pre, & table': { overflowX: 'auto', maxWidth: '100%' },
                                            '& img': { maxWidth: '100%', height: 'auto' },
                                            '& ul': { paddingLeft: '1.5em', marginBottom: 2, listStyleType: 'disc' },
                                            '& ol': { paddingLeft: '1.5em', marginBottom: 2, listStyleType: 'decimal' },
                                            '& li': { marginBottom: '0.15em', lineHeight: '1.6' },
                                            '& blockquote': {
                                                borderLeft: '3px solid',
                                                borderColor: 'border',
                                                marginTop: '0.5em',
                                                marginBottom: '0.5em',
                                                marginLeft: 0,
                                                paddingLeft: '0.75em',
                                                paddingRight: '0.75em',
                                                paddingTop: '0.25em',
                                                paddingBottom: '0.25em',
                                                fontStyle: 'italic',
                                                color: 'secondary',
                                                bg: 'muted',
                                                borderRadius: '0 6px 6px 0',
                                            },
                                            '& blockquote p': { marginBottom: '0.25em' },
                                            '& blockquote p:last-child': { marginBottom: 0 },
                                        }}
                                    />
                                )}
                                {showTranslate && (
                                    <HStack spacing={1} mb={2} cursor="pointer" color="gray.500" _hover={{ color: 'primary' }} onClick={handleTranslate} width="fit-content">
                                        {isTranslating ? <Spinner size="xs" /> : <MdTranslate size={12} />}
                                        <Text fontSize="xs">{isTranslating ? 'Translating...' : 'Translate'}</Text>
                                    </HStack>
                                )}
                            </>
                        )}

                        {/* Hive post preview cards */}
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

                        {/* Hangout preview cards */}
                        {hangoutRoomNames.length > 0 && (
                            <VStack spacing={2} align="stretch" mt={2}>
                                {hangoutRoomNames.map((roomName, index) => (
                                    <HangoutPreviewCard key={`${roomName}-${index}`} roomName={roomName} />
                                ))}
                            </VStack>
                        )}
                            </>
                        )}

                        {/* Actions */}
                        <Flex wrap="wrap" justify="space-between" align="center" mt={3} width="100%" gap={2} pr={2}>
                            <VoteControls
                                initialVoted={comment.active_votes?.some(item => item.voter === user) ?? false}
                                initialVoteCount={comment.active_votes?.length || 0}
                                onVote={handleVote}
                                onVoteOptimistic={(weight) => setOptimisticDeltaHBD(calculateDelta(weight))}
                                onVoteRollback={() => setOptimisticDeltaHBD(0)}
                            />
                            <HStack spacing={{ base: 4, md: 6 }}>
                                <HStack spacing={1} cursor="pointer" onClick={handleReplyModal}>
                                    <FaRegComment />
                                </HStack>
                                {setConversation && (
                                    <Text fontWeight="bold" cursor="pointer" onClick={handleConversation}>
                                        {comment.children}
                                    </Text>
                                )}
                                <HStack spacing={1} cursor="pointer" onClick={handleReSnap}>
                                    <FaRetweet />
                                    <Text fontSize="sm" display={{ base: 'none', sm: 'inline' }}>Re-Snap/Share</Text>
                                </HStack>
                                <HStack spacing={1} cursor="pointer" onClick={handleShareOnX} color="overlay.500" _hover={{ color: 'white' }}>
                                    <FaXTwitter />
                                </HStack>
                            </HStack>
                            <Text fontWeight="bold" fontSize="sm">
                                {payoutDisplay}
                            </Text>
                        </Flex>
                    </Box>
                </Flex>
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
