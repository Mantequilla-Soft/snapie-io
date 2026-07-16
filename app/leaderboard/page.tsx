'use client';
import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { Box, Flex, Heading, Text, Avatar, Spinner, Icon } from '@chakra-ui/react';
import { FiAward } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import { POINTS_FEATURE_FLAG } from '@/lib/points/config';

interface LeaderboardEntry {
  rank: number;
  username: string;
  lifetimeEarned: number;
  balance: number;
}

const MEDAL: Record<number, string> = { 1: '#f1c40f', 2: '#bdc3c7', 3: '#cd7f32' };

export default function LeaderboardPage() {
  const { username: me } = useCurrentUser();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/points/leaderboard?limit=100');
        if (!res.ok) return;
        const data = await res.json();
        if (active) setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch {
        if (active) setEntries([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!POINTS_FEATURE_FLAG) {
    return (
      <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
        <Text color="overlay.500">Snapie Points aren&apos;t available yet.</Text>
      </Box>
    );
  }

  const myRank = me ? entries?.find(e => e.username.toLowerCase() === me.toLowerCase())?.rank : undefined;

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <Flex align="center" gap={3} mb={1}>
        <Icon as={FiAward} boxSize={6} color="primary" />
        <Heading size="lg" fontWeight="bold" color="text">
          Leaderboard
        </Heading>
      </Flex>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Top Snapie Points earners of all time.
        {myRank ? ` You’re #${myRank}.` : ''}
      </Text>

      <Box
        bg="surface"
        borderRadius="16px"
        border="1px solid"
        borderColor="surfaceBorder"
        backdropFilter="blur(18px)"
        overflow="hidden"
      >
        {entries === null ? (
          <Flex justify="center" align="center" py={12}>
            <Spinner size="lg" color="primary" />
          </Flex>
        ) : entries.length === 0 ? (
          <Text color="overlay.500" fontSize="sm" px={6} py={10} textAlign="center">
            No points earned yet — be the first.
          </Text>
        ) : (
          entries.map((e, i) => {
            const isMe = me && e.username.toLowerCase() === me.toLowerCase();
            return (
              <Flex
                key={e.username}
                as={NextLink}
                href={`/@${e.username}`}
                align="center"
                gap={3}
                px={{ base: 4, md: 6 }}
                py={3}
                borderTop={i === 0 ? undefined : '1px solid'}
                borderColor="surfaceBorder"
                bg={isMe ? 'rgba(28, 161, 241, 0.08)' : 'transparent'}
                transition="background 0.15s"
                _hover={{ bg: isMe ? 'rgba(28, 161, 241, 0.12)' : 'rgba(28, 161, 241, 0.05)' }}
              >
                <Text
                  flexShrink={0}
                  w="28px"
                  textAlign="center"
                  fontWeight="bold"
                  fontSize={e.rank <= 3 ? 'lg' : 'sm'}
                  color={MEDAL[e.rank] || 'overlay.500'}
                >
                  {e.rank}
                </Text>
                <Avatar size="sm" name={e.username} src={getHiveAvatarUrl(e.username, 'small')} />
                <Box flex={1} minW={0}>
                  <Text fontWeight="medium" fontSize="sm" color="text" isTruncated>
                    @{e.username}
                    {isMe ? ' (you)' : ''}
                  </Text>
                </Box>
                <Text flexShrink={0} fontWeight="bold" fontSize="sm" color="text">
                  {e.lifetimeEarned.toLocaleString()}
                </Text>
              </Flex>
            );
          })
        )}
      </Box>
    </Box>
  );
}
