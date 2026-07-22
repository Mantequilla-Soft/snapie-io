'use client';
import {
  Box, Heading, Text, Flex, VStack, HStack, Button, Spinner, Link as ChakraLink, useToast,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiExternalLink } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { getActiveProposals, getAccountProposalVotes, proposalVoteBroadcast, ProposalInfo } from '@/lib/hive/governance';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProposalVotingPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const toast = useToast();

  const [proposals, setProposals] = useState<ProposalInfo[]>([]);
  const [myVotes, setMyVotes] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    getActiveProposals(50)
      .then(setProposals)
      .catch(() => toast({ status: 'error', title: 'Could not load proposals' }))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!username) { setMyVotes(new Set()); return; }
    getAccountProposalVotes(username).then(setMyVotes).catch(() => {});
  }, [username]);

  async function handleToggleVote(proposal: ProposalInfo) {
    if (!isLoggedIn || !username) return openLoginModal();
    const alreadyVoted = myVotes.has(proposal.id);
    setPendingId(proposal.id);
    try {
      const result = await proposalVoteBroadcast(username, [proposal.id], !alreadyVoted);
      if (!result.success) throw new Error('Proposal vote failed');
      toast({ status: 'success', title: alreadyVoted ? 'Removed proposal vote' : 'Voted for proposal!' });
      setMyVotes(prev => {
        const next = new Set(prev);
        if (alreadyVoted) next.delete(proposal.id); else next.add(proposal.id);
        return next;
      });
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not cast proposal vote', description: err?.message });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Proposal Voting
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        The Decentralized Hive Fund pays proposals daily based on approval votes. Vote for the ones you want funded.
      </Text>

      <Box
        bg="surface"
        borderRadius="16px"
        border="1px solid"
        borderColor="surfaceBorder"
        backdropFilter="blur(18px)"
        overflow="hidden"
      >
        {isLoading ? (
          <Flex justify="center" py={10}>
            <Spinner />
          </Flex>
        ) : proposals.length === 0 ? (
          <Text color="overlay.500" fontSize="sm" px={6} py={6}>No active proposals right now.</Text>
        ) : (
          <VStack spacing={0} align="stretch" divider={<Box borderBottom="1px solid" borderColor="surfaceBorder" />}>
            {proposals.map((proposal) => {
              const voted = myVotes.has(proposal.id);
              return (
                <Flex key={proposal.id} align="center" gap={3} px={5} py={4}>
                  <Box flex={1} minW={0}>
                    <HStack spacing={1.5}>
                      <Text fontSize="sm" fontWeight="medium" color="text" noOfLines={1}>{proposal.subject}</Text>
                      <ChakraLink
                        href={`https://hive.blog/@${proposal.receiver}/${proposal.permlink}`}
                        isExternal
                        color="overlay.400"
                        _hover={{ color: 'primary' }}
                      >
                        <FiExternalLink size={11} />
                      </ChakraLink>
                    </HStack>
                    <Text fontSize="xs" color="overlay.500" noOfLines={1}>
                      @{proposal.receiver} · {proposal.dailyPayHbd.toLocaleString()} HBD/day · {formatDate(proposal.startDate)} – {formatDate(proposal.endDate)}
                    </Text>
                  </Box>
                  <Button
                    size="sm"
                    flexShrink={0}
                    variant={voted ? 'solid' : 'outline'}
                    colorScheme={voted ? 'blue' : 'gray'}
                    isLoading={pendingId === proposal.id}
                    onClick={() => handleToggleVote(proposal)}
                  >
                    {voted ? 'Voted' : 'Vote'}
                  </Button>
                </Flex>
              );
            })}
          </VStack>
        )}
      </Box>
    </Box>
  );
}
