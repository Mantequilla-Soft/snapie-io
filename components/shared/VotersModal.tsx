'use client';
import React, { useEffect, useState, useCallback } from 'react';
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
  Spinner,
  Link,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { getPost, getReputation } from '@/lib/hive/client-functions';
import { getHiveGlobals } from '@/hooks/useVoteCalculator';
import { calculateValueFromRshares } from '@/lib/hive/voteValueCalculator';
import { Avatar } from '@/components/shared/Avatar';

interface ActiveVote {
  voter: string;
  percent: number;
  rshares: number;
  reputation?: number;
}

interface VotersModalProps {
  isOpen: boolean;
  onClose: () => void;
  author: string;
  permlink: string;
}

interface VoterRow {
  voter: string;
  percent: number;
  reputation?: number;
  value: number;
}

export default function VotersModal({ isOpen, onClose, author, permlink }: VotersModalProps) {
  const [voters, setVoters] = useState<VoterRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [post, globals] = await Promise.all([
        getPost(author, permlink),
        getHiveGlobals(),
      ]);
      const activeVotes: ActiveVote[] = (post as any)?.active_votes || [];

      const rows = activeVotes
        .map((v) => ({
          voter: v.voter,
          percent: v.percent,
          reputation: v.reputation,
          value: calculateValueFromRshares(v.rshares, globals.rewardFund, globals.medianPrice),
        }))
        .sort((a, b) => b.value - a.value);

      setVoters(rows);
    } catch (err) {
      console.error('Error loading voters:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [author, permlink]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="muted" borderColor="border" borderWidth="2px">
        <ModalHeader color="primary" borderBottomWidth="1px" borderBottomColor="border">
          Votes {voters && !loading ? `(${voters.length})` : ''}
        </ModalHeader>
        <ModalCloseButton color="primary" _hover={{ bg: 'background' }} />
        <ModalBody pb={6}>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={8}>
              <Spinner size="lg" color="primary" />
            </Box>
          ) : error ? (
            <Box textAlign="center" py={8}>
              <Text color="accent">Could not load votes. Please try again.</Text>
            </Box>
          ) : !voters || voters.length === 0 ? (
            <Box textAlign="center" py={8}>
              <Text color="accent">No votes yet</Text>
            </Box>
          ) : (
            <VStack spacing={3} align="stretch">
              {voters.map((v) => {
                const isDownvote = v.percent < 0;
                return (
                  <Link
                    key={v.voter}
                    as={NextLink}
                    href={`/@${v.voter}`}
                    _hover={{ textDecoration: 'none' }}
                    onClick={onClose}
                  >
                    <HStack
                      p={3}
                      borderRadius="md"
                      bg="background"
                      borderWidth="1px"
                      borderColor="border"
                      _hover={{
                        bg: 'muted',
                        borderColor: 'primary',
                        transform: 'translateY(-1px)',
                        shadow: 'md',
                      }}
                      transition="all 0.2s"
                      cursor="pointer"
                      justify="space-between"
                    >
                      <HStack>
                        <Avatar size="sm" username={v.voter} />
                        <Box>
                          <Text fontWeight="medium" color="text">@{v.voter}</Text>
                          {typeof v.reputation === 'number' && (
                            <Text fontSize="xs" color="accent">
                              Reputation {getReputation(v.reputation)}
                            </Text>
                          )}
                        </Box>
                      </HStack>
                      <VStack spacing={0} align="flex-end">
                        <Text
                          fontWeight="bold"
                          fontSize="sm"
                          color={isDownvote ? 'red.400' : 'green.400'}
                        >
                          {isDownvote ? '-' : '+'}${Math.abs(v.value).toFixed(3)}
                        </Text>
                        <Text fontSize="xs" color="accent">
                          {(v.percent / 100).toFixed(0)}%
                        </Text>
                      </VStack>
                    </HStack>
                  </Link>
                );
              })}
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
