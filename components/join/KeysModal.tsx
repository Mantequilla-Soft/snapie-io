'use client';

import {
  Box,
  Button,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FaCopy } from 'react-icons/fa';
import type { PrivateKeys } from '@/lib/hive/account-create-client';

interface KeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  keys: PrivateKeys | null;
}

const ROLES: Array<{
  label: string;
  privKey: keyof PrivateKeys;
  pubKey: keyof PrivateKeys;
  hint: string;
}> = [
  { label: 'Owner', privKey: 'owner', pubKey: 'ownerPubkey', hint: 'Recovery only — never paste online' },
  { label: 'Active', privKey: 'active', pubKey: 'activePubkey', hint: 'Wallet, transfers, account management' },
  { label: 'Posting', privKey: 'posting', pubKey: 'postingPubkey', hint: 'Posts, votes, comments — daily use' },
  { label: 'Memo', privKey: 'memo', pubKey: 'memoPubkey', hint: 'Encrypted memos' },
];

export default function KeysModal({ isOpen, onClose, keys }: KeysModalProps) {
  const toast = useToast();

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied`, status: 'success', duration: 1500, isClosable: true });
    } catch {
      toast({ title: `Could not copy ${label.toLowerCase()}`, status: 'error', duration: 2500, isClosable: true });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="rgba(8, 24, 40, 0.96)" color="white" border="1px solid" borderColor="whiteAlpha.200">
        <ModalHeader>Your Hive Keys</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={5}>
            {keys && ROLES.map(({ label, privKey, pubKey, hint }) => (
              <Box key={label} bg="rgba(4, 16, 29, 0.72)" p={3} borderRadius="md" border="1px solid" borderColor="whiteAlpha.100">
                <Text fontSize="sm" fontWeight="bold" mb={1}>{label}</Text>
                <Text fontSize="xs" color="gray.400" mb={2}>{hint}</Text>

                <Text fontSize="xs" color="gray.500" mt={1}>Private</Text>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box flex={1} bg="blackAlpha.500" p={2} borderRadius="sm" fontFamily="mono" fontSize="xs" wordBreak="break-all">
                    {keys[privKey]}
                  </Box>
                  <IconButton
                    aria-label={`Copy ${label} private key`}
                    icon={<FaCopy />}
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(keys[privKey], `${label} private key`)}
                  />
                </Box>

                <Text fontSize="xs" color="gray.500" mt={2}>Public</Text>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box flex={1} bg="blackAlpha.300" p={2} borderRadius="sm" fontFamily="mono" fontSize="xs" wordBreak="break-all" color="gray.300">
                    {keys[pubKey]}
                  </Box>
                  <IconButton
                    aria-label={`Copy ${label} public key`}
                    icon={<FaCopy />}
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(keys[pubKey], `${label} public key`)}
                  />
                </Box>
              </Box>
            ))}
          </Stack>
          <Button mt={5} w="full" onClick={onClose}>Close</Button>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
