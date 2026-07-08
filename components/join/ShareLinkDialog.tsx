'use client';

import { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FaCopy, FaShareAlt } from 'react-icons/fa';
import { QRCodeSVG } from 'qrcode.react';

interface ShareLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  link: string;
  username: string;
  waitingForSponsor: boolean;
}

export default function ShareLinkDialog({ isOpen, onClose, link, username, waitingForSponsor }: ShareLinkDialogProps) {
  const toast = useToast();
  const [qrExpanded, setQrExpanded] = useState(false);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link copied', status: 'success', duration: 1500, isClosable: true });
    } catch {
      toast({ title: 'Could not copy link', status: 'error', duration: 2500, isClosable: true });
    }
  };

  const nativeShare = async () => {
    if (!link) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Sponsor my Snapie account',
          text: `Hi! I'd like to join Snapie as @${username}. Can you sponsor my account creation?`,
          url: link,
        });
      } catch {
        // user dismissed or share failed; no-op
      }
    } else {
      copyLink();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="background" color="text" border="1px solid" borderColor="overlay.200">
        <ModalHeader>Share your invite link</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={4}>
            <Alert status="info" bg="rgba(28, 161, 241, 0.08)" border="1px solid" borderColor="rgba(28, 161, 241, 0.3)" borderRadius="md" color="text">
              <AlertIcon color="rgba(28, 161, 241, 1)" />
              <Text fontSize="sm">
                Send this link to a friend who already has a Hive account.
                They&apos;ll be able to create <Text as="span" fontFamily="mono" fontWeight="bold">@{username}</Text> for you in one click.
              </Text>
            </Alert>

            <Box>
              <Input
                value={link}
                isReadOnly
                onClick={copyLink}
                fontFamily="mono"
                fontSize="sm"
                bg="blackAlpha.500"
                borderColor="overlay.200"
                cursor="pointer"
                pr={12}
              />
              <Box mt={-10} mr={2} display="flex" justifyContent="flex-end" position="relative" zIndex={1}>
                <IconButton
                  aria-label="Copy link"
                  icon={<FaCopy />}
                  size="sm"
                  variant="ghost"
                  onClick={copyLink}
                />
              </Box>
            </Box>

            <Stack align="center" spacing={1}>
              <Box
                onClick={() => setQrExpanded(!qrExpanded)}
                bg="white"
                p={qrExpanded ? 3 : 2}
                borderRadius="md"
                cursor="pointer"
                transition="padding 0.15s"
              >
                <QRCodeSVG
                  value={link}
                  size={qrExpanded ? 220 : 96}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </Box>
              <Text fontSize="xs" color="overlay.500">{qrExpanded ? 'Tap to collapse' : 'Tap to enlarge'}</Text>
            </Stack>

            <HStack>
              <Button flex={1} leftIcon={<FaCopy />} onClick={copyLink} variant="outline">
                Copy link
              </Button>
              <Button flex={1} leftIcon={<FaShareAlt />} onClick={nativeShare} bg="rgba(28, 161, 241, 0.15)" _hover={{ bg: 'rgba(28, 161, 241, 0.25)' }}>
                Share
              </Button>
            </HStack>

            {waitingForSponsor && (
              <Box
                bg="overlay.50"
                border="1px dashed"
                borderColor="overlay.300"
                borderRadius="md"
                p={3}
                display="flex"
                alignItems="center"
                gap={3}
              >
                <Spinner size="sm" />
                <Box>
                  <Text fontSize="sm" fontWeight="medium">Waiting for a sponsor…</Text>
                  <Text fontSize="xs" color="overlay.500">
                    This page will update automatically once your account is created on Hive.
                  </Text>
                </Box>
              </Box>
            )}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
