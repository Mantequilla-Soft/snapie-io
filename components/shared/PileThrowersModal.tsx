'use client';
import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Box,
  Image,
  Link,
  Icon,
  Divider,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiEyeOff } from 'react-icons/fi';
import { Avatar } from '@/components/shared/Avatar';
import type { PileEntry } from '@/lib/points/marketService';

interface PileThrowersModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: PileEntry | null;
}

/** "Who threw what" for one item on the Pile — same list-modal shape as
 *  VotersModal.tsx, just fed from an already-fetched PileEntry instead of
 *  its own network call. */
export default function PileThrowersModal({ isOpen, onClose, entry }: PileThrowersModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="muted" borderColor="border" borderWidth="2px">
        <ModalHeader color="primary" borderBottomWidth="1px" borderBottomColor="border">
          <Text>{entry ? `${entry.item.name} (${entry.count})` : 'Thrown items'}</Text>
        </ModalHeader>
        <ModalCloseButton color="primary" _hover={{ bg: 'background' }} />
        <ModalBody pb={6}>
          {entry && (
            <VStack spacing={3} py={4}>
              <Image src={entry.item.imageUrl} alt={entry.item.name} boxSize="112px" objectFit="contain" />
              <Divider />
            </VStack>
          )}
          {!entry || entry.recentThrowers.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Text color="accent">Nobody&apos;s thrown one yet</Text>
            </Box>
          ) : (
            <VStack spacing={3} align="stretch">
              {entry.recentThrowers.map((t, i) =>
                t.anonymous ? (
                  <HStack
                    key={`anon-${i}`}
                    p={3}
                    borderRadius="md"
                    bg="background"
                    borderWidth="1px"
                    borderColor="border"
                    borderStyle="dashed"
                  >
                    <Box boxSize="32px" borderRadius="full" bg="muted" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                      <Icon as={FiEyeOff} boxSize={4} color="accent" />
                    </Box>
                    <Text fontWeight="medium" color="accent" fontStyle="italic">Anonymous</Text>
                  </HStack>
                ) : (
                  <Link
                    key={`${t.username}-${i}`}
                    as={NextLink}
                    href={`/@${t.username}`}
                    _hover={{ textDecoration: 'none' }}
                    onClick={onClose}
                  >
                    <HStack
                      p={3}
                      borderRadius="md"
                      bg="background"
                      borderWidth="1px"
                      borderColor="border"
                      _hover={{ bg: 'muted', borderColor: 'primary', transform: 'translateY(-1px)', shadow: 'md' }}
                      transition="all 0.2s"
                      cursor="pointer"
                    >
                      <Avatar size="sm" username={t.username} />
                      <Text fontWeight="medium" color="text">@{t.username}</Text>
                    </HStack>
                  </Link>
                ),
              )}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
