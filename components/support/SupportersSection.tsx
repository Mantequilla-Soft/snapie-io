'use client';

import { useEffect, useState } from 'react';
import { Avatar, Box, Divider, Heading, Link, Skeleton, Text, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import NextLink from 'next/link';
import PatronBadge from '@/components/shared/PatronBadge';
import type { PatronTier } from '@/hooks/usePatronStatus';
import hardcoded from '@/data/supporters.json';

interface Supporter {
  account: string;
  tier: PatronTier;
}

const TIER_ORDER: Record<PatronTier, number> = {
  'snap-master': 0,
  'snapian': 1,
  'snaperino': 2,
};

function mergeSupporters(
  sidecar: { account: string; tier: PatronTier }[],
  fixed: { account: string; tier: string }[]
): Supporter[] {
  const map = new Map<string, PatronTier>();

  for (const s of sidecar) map.set(s.account, s.tier);

  for (const f of fixed) {
    const incoming = f.tier as PatronTier;
    const existing = map.get(f.account);
    if (!existing || TIER_ORDER[incoming] < TIER_ORDER[existing]) {
      map.set(f.account, incoming);
    }
  }

  return Array.from(map.entries())
    .map(([account, tier]) => ({ account, tier }))
    .sort((a, b) => {
      const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
      return tierDiff !== 0 ? tierDiff : a.account.localeCompare(b.account);
    });
}

export default function SupportersSection() {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/patrons')
      .then(r => r.json())
      .then(data => setSupporters(mergeSupporters(data.patrons ?? [], hardcoded)))
      .catch(() => setSupporters(mergeSupporters([], hardcoded)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Divider mb={8} />
      <VStack spacing={2} align="center" textAlign="center" mb={8}>
        <Heading size="md">Hall of Fame</Heading>
        <Text fontSize="sm" color="whiteAlpha.600" maxW="440px">
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
        <Text textAlign="center" color="whiteAlpha.500" fontSize="sm">
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
                  borderColor="whiteAlpha.100"
                  _hover={{ borderColor: 'whiteAlpha.300', bg: 'whiteAlpha.50' }}
                  transition="all 0.15s"
                  w="108px"
                  align="center"
                >
                  <Avatar
                    size="md"
                    name={account}
                    src={`https://images.hive.blog/u/${account}/avatar/sm`}
                  />
                  <Text fontSize="xs" fontWeight="bold" color="whiteAlpha.900" noOfLines={1} w="full" textAlign="center">
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
