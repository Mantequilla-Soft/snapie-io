'use client';
import {
  Box, Heading, Text, Flex, VStack, HStack, Button, Input, Spinner, Link as ChakraLink, Badge, useToast,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiExternalLink } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import useHiveAccount from '@/hooks/useHiveAccount';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { witnessVoteWithKeychain } from '@/lib/hive/client-functions';
import { getWitnessesByVote, formatHp, WitnessInfo } from '@/lib/hive/governance';
import { Avatar } from '@/components/shared/Avatar';

const MAX_WITNESS_VOTES = 30;

export default function WitnessVotingPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const { hiveAccount, refetch } = useHiveAccount(username ?? '');
  const toast = useToast();

  const [witnesses, setWitnesses] = useState<WitnessInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [pendingWitness, setPendingWitness] = useState<string | null>(null);

  useEffect(() => {
    getWitnessesByVote(100)
      .then(setWitnesses)
      .catch(() => toast({ status: 'error', title: 'Could not load witnesses' }))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myVotes = useMemo(() => new Set(hiveAccount?.witness_votes ?? []), [hiveAccount]);
  const topVotes = witnesses[0] ? parseFloat(witnesses[0].votes) : 0;

  const visibleWitnesses = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return witnesses;
    return witnesses.filter(w => w.owner.toLowerCase().includes(q));
  }, [witnesses, filter]);

  async function handleToggleVote(witness: WitnessInfo) {
    if (!isLoggedIn || !username) return openLoginModal();
    const alreadyVoted = myVotes.has(witness.owner);
    if (!alreadyVoted && myVotes.size >= MAX_WITNESS_VOTES) {
      toast({ status: 'warning', title: `You can only vote for up to ${MAX_WITNESS_VOTES} witnesses`, description: 'Remove a vote first to add a new one.' });
      return;
    }
    setPendingWitness(witness.owner);
    try {
      const result = await witnessVoteWithKeychain(username, witness.owner, !alreadyVoted);
      if (!result.success) throw new Error(result.error || 'Witness vote failed');
      toast({ status: 'success', title: alreadyVoted ? `Removed vote for @${witness.owner}` : `Voted for @${witness.owner}!` });
      refetch();
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not cast witness vote', description: err?.message });
    } finally {
      setPendingWitness(null);
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Witness Voting
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={1}>
        Witnesses run the servers that keep the Hive blockchain running. You can approve up to {MAX_WITNESS_VOTES}.
      </Text>
      {isLoggedIn && (
        <Text color="overlay.400" fontSize="xs" mb={6}>
          {myVotes.size} / {MAX_WITNESS_VOTES} votes used
        </Text>
      )}
      {!isLoggedIn && <Box mb={6} />}

      <Input
        placeholder="Search witnesses..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        bg="surface"
        borderColor="surfaceBorder"
        mb={4}
      />

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
        ) : visibleWitnesses.length === 0 ? (
          <Text color="overlay.500" fontSize="sm" px={6} py={6}>No witnesses match that search.</Text>
        ) : (
          <VStack spacing={0} align="stretch" divider={<Box borderBottom="1px solid" borderColor="surfaceBorder" />}>
            {visibleWitnesses.map((witness) => {
              const voted = myVotes.has(witness.owner);
              const barPercent = topVotes > 0 ? Math.max(2, (parseFloat(witness.votes) / topVotes) * 100) : 0;
              return (
                <Flex key={witness.owner} align="center" gap={3} px={5} py={3}>
                  <Flex align="center" gap={3} flex={1} minW={0} opacity={witness.isActive ? 1 : 0.55}>
                    <Text fontSize="xs" color="overlay.400" w="28px" flexShrink={0}>#{witness.rank}</Text>
                    <Avatar
                      username={witness.owner}
                      size="32px"
                      flexShrink={0}
                      sx={{ border: '1px solid rgba(28, 161, 241, 0.3)' }}
                    />
                    <Box flex={1} minW={0}>
                      <HStack spacing={1.5}>
                        <Text fontSize="sm" fontWeight="medium" color="text" noOfLines={1}>@{witness.owner}</Text>
                        {witness.url && (
                          <ChakraLink href={witness.url} isExternal color="overlay.400" _hover={{ color: 'primary' }}>
                            <FiExternalLink size={11} />
                          </ChakraLink>
                        )}
                        {!witness.isActive && (
                          <Badge colorScheme="red" fontSize="9px" px={1.5} py={0} lineHeight="1.5" borderRadius="4px" flexShrink={0}>
                            Inactive
                          </Badge>
                        )}
                      </HStack>
                      <Text fontSize="11px" color="overlay.400" noOfLines={1}>
                        {formatHp(witness.supportHp)} supporting
                      </Text>
                      <Box mt={1} h="4px" w="100%" bg="overlay.100" borderRadius="full" overflow="hidden">
                        <Box h="100%" bg={witness.isActive ? 'primary' : 'overlay.400'} borderRadius="full" width={`${barPercent}%`} />
                      </Box>
                    </Box>
                  </Flex>
                  <Button
                    size="sm"
                    flexShrink={0}
                    variant={voted ? 'solid' : 'outline'}
                    colorScheme={voted ? 'blue' : 'gray'}
                    isLoading={pendingWitness === witness.owner}
                    onClick={() => handleToggleVote(witness)}
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
