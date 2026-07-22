'use client';
import {
  Box, Heading, Text, Flex, VStack, HStack, Button, Spinner, Link as ChakraLink, Badge, useToast,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiFileText, FiArrowDownCircle } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { getVotableProposals, getAccountProposalVotes, proposalVoteBroadcast, formatHp, ProposalInfo } from '@/lib/hive/governance';

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
    getVotableProposals(50)
      .then(setProposals)
      .catch(() => toast({ status: 'error', title: 'Could not load proposals' }))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!username) { setMyVotes(new Set()); return; }
    getAccountProposalVotes(username).then(setMyVotes).catch(() => {});
  }, [username]);

  const activeProposals = useMemo(() => proposals.filter(p => !p.isUpcoming), [proposals]);
  const upcomingProposals = useMemo(() => proposals.filter(p => p.isUpcoming), [proposals]);
  // Bars are relative to the single top proposal across both groups so an
  // upcoming proposal's bar reads on the same scale as an active one's.
  const topSupportHp = useMemo(() => Math.max(0, ...proposals.map(p => p.supportHp)), [proposals]);

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

      {isLoading ? (
        <Flex justify="center" py={10}>
          <Spinner />
        </Flex>
      ) : proposals.length === 0 ? (
        <Text color="overlay.500" fontSize="sm" px={6} py={6}>No proposals right now.</Text>
      ) : (
        <>
          <Box
            bg="surface"
            borderRadius="16px"
            border="1px solid"
            borderColor="surfaceBorder"
            backdropFilter="blur(18px)"
            overflow="hidden"
          >
            <VStack spacing={0} align="stretch" divider={<Box borderBottom="1px solid" borderColor="surfaceBorder" />}>
              {activeProposals.map((proposal) => {
                const voted = myVotes.has(proposal.id);
                return (
                  <Box key={proposal.id} bg={proposal.isReturnProposal ? 'rgba(28, 161, 241, 0.05)' : undefined}>
                    <Flex align="center" gap={3} px={5} py={4} opacity={proposal.isFunded ? 1 : 0.6}>
                      <Box flex={1} minW={0}>
                        <HStack spacing={1.5}>
                          <Text fontSize="sm" fontWeight="medium" color="text" noOfLines={1}>{proposal.subject}</Text>
                          <ChakraLink
                            as={NextLink}
                            href={`/@${proposal.creator}/${proposal.permlink}`}
                            color="overlay.400"
                            _hover={{ color: 'primary' }}
                          >
                            <FiFileText size={11} />
                          </ChakraLink>
                          {proposal.isReturnProposal ? (
                            <Badge colorScheme="blue" fontSize="9px" px={1.5} py={0} lineHeight="1.5" borderRadius="4px" flexShrink={0}>
                              Funding threshold
                            </Badge>
                          ) : !proposal.isFunded && (
                            <Badge colorScheme="red" fontSize="9px" px={1.5} py={0} lineHeight="1.5" borderRadius="4px" flexShrink={0}>
                              Unfunded
                            </Badge>
                          )}
                        </HStack>
                        {proposal.isReturnProposal ? (
                          <Text fontSize="xs" color="overlay.500" noOfLines={2}>
                            <FiArrowDownCircle style={{ display: 'inline', marginRight: 4 }} />
                            Votes here return unused DHF funds to the treasury instead of funding proposals ranked below — everything under this line isn&apos;t getting paid right now.
                          </Text>
                        ) : (
                          <>
                            <Text fontSize="xs" color="overlay.500" noOfLines={1}>
                              @{proposal.receiver} · {proposal.dailyPayHbd.toLocaleString()} HBD/day · {formatDate(proposal.startDate)} – {formatDate(proposal.endDate)}
                            </Text>
                            <Text fontSize="xs" color="overlay.400" noOfLines={1}>
                              {proposal.isFunded
                                ? `~${Math.round(proposal.estPaidHbd).toLocaleString()} HBD paid to date (est.)`
                                : 'Not currently funded'}
                              {' · '}{formatHp(proposal.supportHp)} supporting
                            </Text>
                          </>
                        )}
                        <Box mt={1.5} h="4px" w="100%" bg="overlay.100" borderRadius="full" overflow="hidden">
                          <Box
                            h="100%"
                            bg={proposal.isFunded ? 'primary' : 'overlay.400'}
                            borderRadius="full"
                            width={`${topSupportHp > 0 ? Math.max(2, (proposal.supportHp / topSupportHp) * 100) : 0}%`}
                          />
                        </Box>
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
                  </Box>
                );
              })}
            </VStack>
          </Box>

          {upcomingProposals.length > 0 && (
            <>
              <Text fontSize="xs" fontWeight="bold" color="overlay.400" letterSpacing="widest" textTransform="uppercase" mt={6} mb={3} px={2}>
                Upcoming — not started yet
              </Text>
              <Box
                bg="surface"
                borderRadius="16px"
                border="1px solid"
                borderColor="surfaceBorder"
                backdropFilter="blur(18px)"
                overflow="hidden"
              >
                <VStack spacing={0} align="stretch" divider={<Box borderBottom="1px solid" borderColor="surfaceBorder" />}>
                  {upcomingProposals.map((proposal) => {
                    const voted = myVotes.has(proposal.id);
                    return (
                      <Flex key={proposal.id} align="center" gap={3} px={5} py={4}>
                        <Box flex={1} minW={0}>
                          <HStack spacing={1.5}>
                            <Text fontSize="sm" fontWeight="medium" color="text" noOfLines={1}>{proposal.subject}</Text>
                            <ChakraLink
                              as={NextLink}
                              href={`/@${proposal.creator}/${proposal.permlink}`}
                              color="overlay.400"
                              _hover={{ color: 'primary' }}
                            >
                              <FiFileText size={11} />
                            </ChakraLink>
                          </HStack>
                          <Text fontSize="xs" color="overlay.500" noOfLines={1}>
                            @{proposal.receiver} · {proposal.dailyPayHbd.toLocaleString()} HBD/day · starts {formatDate(proposal.startDate)}
                          </Text>
                          <Text fontSize="xs" color="overlay.400" noOfLines={1}>
                            {formatHp(proposal.supportHp)} supporting
                          </Text>
                          <Box mt={1.5} h="4px" w="100%" bg="overlay.100" borderRadius="full" overflow="hidden">
                            <Box
                              h="100%"
                              bg="overlay.400"
                              borderRadius="full"
                              width={`${topSupportHp > 0 ? Math.max(2, (proposal.supportHp / topSupportHp) * 100) : 0}%`}
                            />
                          </Box>
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
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
