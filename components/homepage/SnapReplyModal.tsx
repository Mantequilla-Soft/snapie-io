import { Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, HStack, Avatar, Link, IconButton, Box, Text, Spinner } from '@chakra-ui/react';
import React, { useRef, useMemo, useState } from 'react';
import SnapComposer from './SnapComposer';
import { Comment } from '@hiveio/dhive';
import { CloseIcon } from '@chakra-ui/icons';
import { MdTranslate } from 'react-icons/md';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { separateContent } from '@/lib/utils/snapUtils';
import MediaRenderer from '@/components/shared/MediaRenderer';
import { getPostDate } from '@/lib/utils/GetPostDate';
import NextLink from 'next/link';
import { translationCache } from '@/lib/utils/translationCache';

interface SnapReplyModalProps {
    isOpen: boolean;
    onClose: () => void;
    comment?: Comment;
    onNewReply: (newComment: Partial<Comment>) => void;
}

export default function SnapReplyModal({ isOpen, onClose, comment, onNewReply }: SnapReplyModalProps) {
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const [translatedText, setTranslatedText] = useState<string | null>(
        () => (comment?.permlink ? translationCache.get(comment.permlink) ?? null : null)
    );
    const [isTranslating, setIsTranslating] = useState(false);

    // Split body into text and media so ThreeSpeak videos use the Mantequilla
    // player (via MediaRenderer) instead of a plain iframe from markdownRenderer.
    const { text, media } = useMemo(() => separateContent(comment?.body ?? ''), [comment?.body]);
    const renderedText = useMemo(
        () => text ? markdownRenderer(text, { defaultEmojiOwner: comment?.author ?? '' }) : '',
        [text, comment?.author]
    );

    async function handleTranslate() {
        if (isTranslating || !text || !comment) return;
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
            }
        } catch {
            // silent — original text stays visible
        } finally {
            setIsTranslating(false);
        }
    }

    if (!comment) {
        return <div></div>;
    }

    const commentDate = getPostDate(comment.created)

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="2xl" initialFocusRef={composerRef}>
            <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" />
            <ModalContent bg="background" color="text" position="relative">
                <IconButton
                    aria-label="Close"
                    icon={<CloseIcon />}
                    onClick={onClose}
                    position="absolute"
                    top={2}
                    right={2}
                    variant="unstyled"
                    size="lg"
                />
                <ModalHeader>
                    <HStack mb={2}>
                        <Avatar size="sm" name={comment.author} src={`https://images.hive.blog/u/${comment.author}/avatar/sm`} />
                        <Box ml={3}>
                            <Text fontWeight="medium" fontSize="sm">
                                <Link as={NextLink} href={`/@${comment.author}`}>@{comment.author}</Link>
                            </Text>
                            <Text fontWeight="medium" fontSize="sm" color="primary">
                                {commentDate}
                            </Text>
                        </Box>
                    </HStack>
                </ModalHeader>
                <ModalBody>
                    <Box pb={6}>
                        {translatedText ? (
                            <Box>
                                <Text fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-word" mb={2}>
                                    {translatedText}
                                </Text>
                                <Text
                                    as="button"
                                    fontSize="xs"
                                    color="gray.500"
                                    _hover={{ color: 'primary' }}
                                    onClick={() => { translationCache.delete(comment!.permlink); setTranslatedText(null); }}
                                >
                                    Show original
                                </Text>
                            </Box>
                        ) : (
                            <>
                                {renderedText && (
                                    <Box
                                        dangerouslySetInnerHTML={{ __html: renderedText }}
                                        sx={{
                                            '& p': { marginBottom: '0.75em', lineHeight: '1.6' },
                                            '& a': { color: 'var(--chakra-colors-primary)', textDecoration: 'underline' },
                                            '& ul': { paddingLeft: '1.5em', marginBottom: '0.75em', listStyleType: 'disc' },
                                            '& ol': { paddingLeft: '1.5em', marginBottom: '0.75em', listStyleType: 'decimal' },
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
                                {text && (
                                    <HStack
                                        spacing={1}
                                        mt={1}
                                        cursor="pointer"
                                        color="gray.500"
                                        _hover={{ color: 'primary' }}
                                        onClick={handleTranslate}
                                        width="fit-content"
                                    >
                                        {isTranslating ? <Spinner size="xs" /> : <MdTranslate size={12} />}
                                        <Text fontSize="xs">{isTranslating ? 'Translating...' : 'Translate'}</Text>
                                    </HStack>
                                )}
                            </>
                        )}
                        {media && (
                            <MediaRenderer mediaContent={media} />
                        )}
                    </Box>
                    <SnapComposer ref={composerRef} pa={comment.author} pp={comment.permlink} onNewComment={onNewReply} post={true} onClose={onClose} />
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
