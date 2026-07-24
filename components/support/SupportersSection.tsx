'use client';

import { useEffect, useState } from 'react';
import { Box, Divider, Heading, Link, Skeleton, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { Avatar } from '@/components/shared/Avatar';
import NextLink from 'next/link';
import PatronBadge from '@/components/shared/PatronBadge';
import type { PatronTier } from '@/hooks/usePatronStatus';

interface Supporter {
  account: string;
  tier: PatronTier;
}

const TIER_ORDER: Record<PatronTier, number> = { 'snap-master': 0, 'snapian': 1, 'snaperino': 2 };

export default function SupportersSection() {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/patrons')
      .then(r => r.json())
      .then(data => {
        const sorted = [...(data.patrons ?? [])].sort((a: Supporter, b: Supporter) => {
          const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
          return tierDiff !== 0 ? tierDiff : a.account.localeCompare(b.account);
        });
        setSupporters(sorted);
      })
      .catch(() => setSupporters([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Divider mb={8} />
      <VStack spacing={2} align="center" textAlign="center" mb={8}>
        <Heading size="md">Hall of Fame</Heading>
        <Text fontSize="sm" color="overlay.600" maxW="440px">
          Snapie is made possible by the contribution of these lovely humans:
        </Text>
      </VStack>

      {loading ? (
        <Wrap spacing={4} justify="center">
          {Array.from({ length: 5 }).map((_, i) => (
            <WrapItem key={i}>
              <Skeleton borderRadius="xl" width="108px" height="130px" />
            </WrapItem>
          ))}
        </Wrap>
      ) : supporters.length === 0 ? (
        <Text textAlign="center" color="overlay.500" fontSize="sm">
          Be the first to support Snapie!
        </Text>
      ) : (
        <Wrap spacing={4} justify="center">
          {supporters.map(({ account, tier }) => (
            <WrapItem key={account}>
              <Link as={NextLink} href={`/@${account}`} _hover={{ textDecoration: 'none' }}>
                <VStack
                  spacing={2}
                  p={3}
                  borderRadius="xl"
                  borderWidth={1}
                  borderColor="overlay.100"
                  _hover={{ borderColor: 'overlay.300', bg: 'overlay.50' }}
                  transition="all 0.15s"
                  w="108px"
                  align="center"
                >
                  <Avatar size="md" username={account} />
                  <Text fontSize="xs" fontWeight="bold" color="overlay.900" noOfLines={1} w="full" textAlign="center">
                    @{account}
                  </Text>
                  <PatronBadge tier={tier} />
                </VStack>
              </Link>
            </WrapItem>
          ))}
        </Wrap>
      )}
    </Box>
  );
}
