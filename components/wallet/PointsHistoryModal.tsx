'use client';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton,
  VStack, HStack, Flex, Text, Box, Spinner, Divider, Icon,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { FaCoins, FaShoppingCart, FaGift, FaRandom, FaAward } from 'react-icons/fa';
import { PointsTransaction, TransactionType } from '@/lib/points/transactionHistory';

interface PointsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

// The API serializes `createdAt` as an ISO string over JSON, not a Date.
type WireTransaction = Omit<PointsTransaction, 'createdAt'> & { createdAt: string };

const TYPE_ICON: Record<TransactionType, React.ElementType> = {
  earn: FaCoins,
  purchase: FaShoppingCart,
  admin_grant: FaGift,
  roulette: FaRandom,
  badge_purchase: FaAward,
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function PointsHistoryModal({ isOpen, onClose, username }: PointsHistoryModalProps) {
  const [transactions, setTransactions] = useState<WireTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/points/transactions?username=${encodeURIComponent(username)}&limit=10`)
      .then(res => (res.ok ? res.json() : { transactions: [] }))
      .then(data => setTransactions(data.transactions ?? []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [isOpen, username]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="muted" borderColor="border" borderWidth="2px">
        <ModalHeader color="primary" borderBottomWidth="1px" borderBottomColor="border">
          Points History
        </ModalHeader>
        <ModalCloseButton color="primary" _hover={{ bg: 'background' }} />
        <ModalBody pb={6}>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={8}>
              <Spinner size="lg" color="primary" />
            </Box>
          ) : transactions.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Text color="accent">No activity yet</Text>
            </Box>
          ) : (
            <VStack spacing={0} align="stretch">
              {transactions.map((tx, i) => (
                <Box key={i}>
                  <Flex align="center" gap={3} py={3}>
                    <Flex flexShrink={0} w={8} h={8} borderRadius="full" bg="background" align="center" justify="center">
                      <Icon as={TYPE_ICON[tx.type]} boxSize={3.5} color="accent" />
                    </Flex>
                    <Box flex={1}>
                      <Text fontSize="sm" color="text">{tx.label}</Text>
                      <Text fontSize="xs" color="overlay.500">{formatTimestamp(tx.createdAt)}</Text>
                    </Box>
                    <Text fontSize="sm" fontWeight="bold" color={tx.delta >= 0 ? 'success' : 'error'} flexShrink={0}>
                      {tx.delta >= 0 ? '+' : ''}{tx.delta.toLocaleString()}
                    </Text>
                  </Flex>
                  {i < transactions.length - 1 && <Divider borderColor="border" />}
                </Box>
              ))}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
