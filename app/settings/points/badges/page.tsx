'use client';
import {
  Box, Heading, Text, Flex, SimpleGrid, Button, Image, Link as ChakraLink, useToast, Badge,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { MOOD_BADGE_SKUS, MOOD_BADGES, MoodBadgeSku } from '@/lib/moodBadges/constants';
import { buyMoodBadge, equipMoodBadge, getMyMoodBadges } from '@/lib/moodBadges/client';

export default function MoodBadgesPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();

  const [owned, setOwned] = useState<string[]>([]);
  const [equipped, setEquipped] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<MoodBadgeSku | null>(null);

  useEffect(() => {
    if (!username) return;
    getMyMoodBadges(username).then(data => {
      setOwned(data.owned);
      setEquipped(data.equipped);
    });
  }, [username]);

  async function handleBuy(sku: MoodBadgeSku) {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    setBusySku(sku);
    try {
      const result = await buyMoodBadge(username, sku);
      if (result.status === 'purchased') {
        setOwned(result.owned);
        setEquipped(result.equipped);
        toast({
          status: 'success',
          title: `${MOOD_BADGES[sku].label} badge unlocked!`,
          description: 'It can take a couple minutes to show up on your avatar everywhere — that\'s expected, not a failed purchase.',
          duration: 6000,
        });
      } else if (result.status === 'already_owned') {
        setOwned(result.owned);
        setEquipped(result.equipped);
        toast({ status: 'info', title: 'You already own this one' });
      } else {
        toast({ status: 'warning', title: 'Not enough points', description: `You need ${MOOD_BADGES[sku].price.toLocaleString()} points for this badge.` });
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Purchase failed', description: err?.message });
    } finally {
      setBusySku(null);
    }
  }

  async function handleEquip(sku: MoodBadgeSku) {
    if (!username) return;
    setBusySku(sku);
    try {
      const isEquipped = equipped === sku;
      const result = await equipMoodBadge(username, isEquipped ? null : sku);
      if (result.status === 'equipped') {
        setEquipped(result.equipped);
        toast({
          status: 'success',
          title: result.equipped ? `${MOOD_BADGES[sku].label} equipped` : 'Badge unequipped',
          description: 'It can take a couple minutes to show up on your avatar everywhere.',
          duration: 6000,
        });
      } else {
        toast({ status: 'error', title: 'Could not update your badge' });
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not update your badge', description: err?.message });
    } finally {
      setBusySku(null);
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Mood Badges
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={1}>
        Show how you&apos;re feeling next to your avatar. Buy with points, switch anytime.
      </Text>
      {isLoggedIn && (
        <Text color="overlay.400" fontSize="xs" mb={6}>
          Current balance: {points ? points.balance.toLocaleString() : '—'} points
        </Text>
      )}
      {!isLoggedIn && <Box mb={6} />}

      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
        {MOOD_BADGE_SKUS.map(sku => {
          const badge = MOOD_BADGES[sku];
          const isOwned = owned.includes(sku);
          const isEquipped = equipped === sku;
          const isBusy = busySku === sku;
          const canAfford = !!points && points.balance >= badge.price;

          return (
            <Box
              key={sku}
              bg="surface"
              borderRadius="16px"
              border="1px solid"
              borderColor={isEquipped ? 'primary' : 'surfaceBorder'}
              backdropFilter="blur(18px)"
              p={5}
              textAlign="center"
            >
              <Flex justify="center" mb={3}>
                <Image src={badge.imageSrc} alt={badge.label} boxSize="72px" objectFit="contain" />
              </Flex>
              <Flex justify="center" align="center" gap={2} mb={1}>
                <Text fontWeight="bold" color="text">{badge.label}</Text>
                {isEquipped && <Badge colorScheme="blue">Equipped</Badge>}
              </Flex>
              <Text fontSize="sm" color="overlay.400" mb={4}>
                {badge.price.toLocaleString()} points
              </Text>

              {isOwned ? (
                <Button
                  size="sm"
                  width="100%"
                  variant={isEquipped ? 'outline' : 'solid'}
                  colorScheme="blue"
                  leftIcon={isEquipped ? <FiCheck /> : undefined}
                  onClick={() => handleEquip(sku)}
                  isLoading={isBusy}
                >
                  {isEquipped ? 'Equipped' : 'Equip'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  width="100%"
                  colorScheme="blue"
                  onClick={() => handleBuy(sku)}
                  isLoading={isBusy}
                  isDisabled={isLoggedIn && !canAfford}
                >
                  {isLoggedIn ? (canAfford ? 'Buy' : 'Not enough points') : 'Log in to buy'}
                </Button>
              )}
            </Box>
          );
        })}
      </SimpleGrid>

      <Text fontSize="xs" color="overlay.400" mt={6}>
        Badges are non-refundable and don&apos;t affect your leaderboard rank. After buying or
        switching, it can take a couple minutes to show up on your avatar everywhere — that&apos;s
        normal, not a failed purchase.
      </Text>
    </Box>
  );
}
