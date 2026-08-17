'use client';
import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { Box, Flex, Heading, Text, Spinner, Icon } from '@chakra-ui/react';
import { FiAward } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { Avatar } from '@/components/shared/Avatar';
import { MoodBadgeIcon } from '@/components/shared/MoodBadgeIcon';
import { useMoodBadges } from '@/hooks/useMoodBadges';
import { POINTS_FEATURE_FLAG } from '@/lib/points/config';

interface LeaderboardEntry {
  rank: number;
  username: string;
  lifetimeEarned: number;
  balance: number;
}

// The board only ever shows the top of the pack — nobody scrolls past a
// few hundred rows looking for themselves, and getLeaderboard caps at this
// anyway. Anyone outside it sees their real position via the pinned row
// below, computed separately (see usePointsSummary) instead of by loading
// the rest of the board.
const TOP_N = 100;
const MEDAL: Record<number, string> = { 1: '#f1c40f', 2: '#bdc3c7', 3: '#cd7f32' };

export default function LeaderboardPage() {
  const { username: me } = useCurrentUser();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const { getEquippedBadge } = useMoodBadges();
  const mySummary = usePointsSummary(me);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/points/leaderboard?limit=${TOP_N}&offset=0`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } finally {
        if (!cancelled) setInitialLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!POINTS_FEATURE_FLAG) {
    return (
      <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
        <Text color="overlay.500">Snapie Points aren&apos;t available yet.</Text>
      </Box>
    );
  }

  const myRank = me ? entries.find(e => e.username.toLowerCase() === me.toLowerCase())?.rank : undefined;
  // Prefer the authoritative rank from usePointsSummary (works at any
  // position); fall back to the in-list match while it's still loading.
  const displayRank = mySummary?.rank ?? myRank;
  const showPinnedRow = !!me && !!mySummary?.rank && mySummary.rank > TOP_N;

  return (
    <Box
      id="scrollableDiv"
      h="100vh"
      overflowY="auto"
      sx={{
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <Flex align="center" gap={3} mb={1}>
        <Icon as={FiAward} boxSize={6} color="primary" />
        <Heading size="lg" fontWeight="bold" color="text">
          Leaderboard
        </Heading>
      </Flex>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Top {TOP_N} Snapie Points earners of all time.
        {displayRank ? ` You’re #${displayRank}.` : ''}
      </Text>

      <Box
        bg="surface"
        borderRadius="16px"
        border="1px solid"
        borderColor="surfaceBorder"
        backdropFilter="blur(18px)"
        overflow="hidden"
      >
        {initialLoad ? (
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
                <Avatar
                  size="sm"
                  username={e.username}
                  overlay={
                    getEquippedBadge(e.username)
                      ? <MoodBadgeIcon sku={getEquippedBadge(e.username)!} username={e.username} size="16px" />
                      : undefined
                  }
                />
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

      {showPinnedRow && me && mySummary && (
        <Box
          mt={3}
          bg="surface"
          borderRadius="16px"
          border="1px solid"
          borderColor="primary"
          backdropFilter="blur(18px)"
          overflow="hidden"
        >
          <Flex as={NextLink} href={`/@${me}`} align="center" gap={3} px={{ base: 4, md: 6 }} py={3}>
            <Text flexShrink={0} w="28px" textAlign="center" fontWeight="bold" fontSize="sm" color="overlay.500">
              #{mySummary.rank}
            </Text>
            <Avatar
              size="sm"
              username={me}
              overlay={
                getEquippedBadge(me)
                  ? <MoodBadgeIcon sku={getEquippedBadge(me)!} username={me} size="16px" />
                  : undefined
              }
            />
            <Box flex={1} minW={0}>
              <Text fontWeight="medium" fontSize="sm" color="text" isTruncated>
                @{me} (you)
              </Text>
            </Box>
            <Text flexShrink={0} fontWeight="bold" fontSize="sm" color="text">
              {mySummary.lifetimeEarned.toLocaleString()}
            </Text>
          </Flex>
        </Box>
      )}
    </Box>
    </Box>
  );
}
