'use client';
import {
    Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton,
    Box, Flex, Spinner, Text,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

const WIDGET_URL    = 'https://decentmemes.com/widget/';
const WIDGET_ORIGIN = 'https://decentmemes.com';

interface MemePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function MemePickerModal({ isOpen, onClose }: MemePickerModalProps) {
    const iframeRef  = useRef<HTMLIFrameElement>(null);
    const [loaded, setLoaded] = useState(false);

    // Reset load state each time the modal opens
    useEffect(() => {
        if (isOpen) setLoaded(false);
    }, [isOpen]);

    function handleLoad() {
        setLoaded(true);
        // Claim our 1% frontend slot and sync dark theme
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'frontendInit', account: 'snapie', theme: 'dark' },
            WIDGET_ORIGIN,
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
            <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(8px)" />
            <ModalContent
                bg="rgba(8, 24, 40, 0.97)"
                border="1px solid rgba(28, 161, 241, 0.15)"
                borderRadius="16px"
                overflow="hidden"
                mx={3}
            >
                <ModalCloseButton color="whiteAlpha.600" zIndex={10} />
                <ModalBody p={0} position="relative" minH="640px">
                    {!loaded && (
                        <Flex h="640px" align="center" justify="center" direction="column" gap={3}>
                            <Spinner color="blue.400" size="lg" />
                            <Text color="whiteAlpha.500" fontSize="sm">Loading meme picker…</Text>
                        </Flex>
                    )}
                    <Box display={loaded ? 'block' : 'none'}>
                        <iframe
                            ref={iframeRef}
                            src={isOpen ? WIDGET_URL : undefined}
                            width="100%"
                            height="640"
                            style={{ border: 0, display: 'block' }}
                            allow="clipboard-write"
                            onLoad={handleLoad}
                        />
                    </Box>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
