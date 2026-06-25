import { Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, HStack, Avatar, Link, IconButton, Box, Text } from '@chakra-ui/react';
import React, { useRef, useMemo } from 'react';
import SnapComposer from './SnapComposer';
import { Comment } from '@hiveio/dhive';
import { CloseIcon } from '@chakra-ui/icons';
import markdownRenderer from '@/lib/utils/MarkdownRenderer';
import { separateContent } from '@/lib/utils/snapUtils';
import MediaRenderer from '@/components/shared/MediaRenderer';
import { getPostDate } from '@/lib/utils/GetPostDate';
import NextLink from 'next/link';

interface SnapReplyModalProps {
    isOpen: boolean;
    onClose: () => void;
    comment?: Comment;
    onNewReply: (newComment: Partial<Comment>) => void;
}

export default function SnapReplyModal({ isOpen, onClose, comment, onNewReply }: SnapReplyModalProps) {
    const composerRef = useRef<HTMLTextAreaElement>(null);

    // Split body into text and media so ThreeSpeak videos use the Mantequilla
    // player (via MediaRenderer) instead of a plain iframe from markdownRenderer.
    const { text, media } = useMemo(() => separateContent(comment?.body ?? ''), [comment?.body]);
    const renderedText = useMemo(
        () => text ? markdownRenderer(text, { defaultEmojiOwner: comment?.author ?? '' }) : '',
        [text, comment?.author]
    );

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
                        {renderedText && (
                            <Box
                                dangerouslySetInnerHTML={{ __html: renderedText }}
                                sx={{
                                    '& p': { marginBottom: '0.75em', lineHeight: '1.6' },
                                    '& a': { color: 'var(--chakra-colors-primary)', textDecoration: 'underline' },
                                    '& ul': { paddingLeft: '1.5em', marginBottom: '0.75em', listStyleType: 'disc' },
                                    '& ol': { paddingLeft: '1.5em', marginBottom: '0.75em', listStyleType: 'decimal' },
                                    '& li': { marginBottom: '0.15em', lineHeight: '1.6' },
                                }}
                            />
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
