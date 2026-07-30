'use client';
import { useState } from 'react';
import {
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Text,
} from '@chakra-ui/react';
import { FiInfo } from 'react-icons/fi';
import { WALLET_TERMS, WalletTermKey } from '@/lib/wallet/walletTerms';

interface WalletTermInfoProps {
  term: WalletTermKey;
}

/** Small "what is this?" trigger for a wallet term, scoped to the handful of
 *  genuinely confusing ones (see walletTerms.ts) rather than every label on
 *  the page. Each instance owns its own modal — cheap for read-only text,
 *  and simpler than threading shared open/close state through WalletPage
 *  for six independent triggers. */
export default function WalletTermInfo({ term }: WalletTermInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { title, body } = WALLET_TERMS[term];

  return (
    <>
      <IconButton
        aria-label={`What is ${title}?`}
        icon={<FiInfo />}
        size="xs"
        minW="auto"
        h="auto"
        p={0.5}
        fontSize="13px"
        variant="ghost"
        color="overlay.500"
        _hover={{ color: 'overlay.700', bg: 'transparent' }}
        onClick={() => setIsOpen(true)}
      />
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} isCentered size="sm">
        <ModalOverlay />
        <ModalContent mx={4}>
          <ModalHeader>{title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text fontSize="sm" color="overlay.700">{body}</Text>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
