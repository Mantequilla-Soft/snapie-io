'use client';
import {
  Box, Heading, Text, Flex, HStack, SimpleGrid, Button, Image, Link as ChakraLink, useToast, Divider,
} from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiPlus } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { listMarketItems, buyItem, claimOwnItem, getMyInventory } from '@/lib/points/marketClient';
import type { ItemDTO, InventoryEntry, CatalogSort } from '@/lib/points/marketService';
import { notEnoughPointsToast } from '@/components/shared/NotEnoughPointsToast';

export default function ItemMarketPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();

  const [sort, setSort] = useState<CatalogSort>('hot');
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  useEffect(() => {
    listMarketItems(sort, 0).then(page => {
      setItems(page.items);
      setHasMore(page.hasMore);
    });
  }, [sort]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const page = await listMarketItems(sort, items.length);
      setItems(prev => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [sort, items.length]);

  useEffect(() => {
    if (!username) { setInventory([]); return; }
    getMyInventory(username).then(setInventory);
  }, [username]);

  async function handleBuy(item: ItemDTO) {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    setBusyItemId(item.id);
    try {
      const result = await buyItem(username, item.id, item.price);
      if (result.status === 'purchased' || result.status === 'already_purchased') {
        getMyInventory(username).then(setInventory);
        // Only a genuine 'purchased' actually bumps Item.purchaseCount
        // server-side — 'already_purchased' is an idempotency replay (a
        // duplicated request under the same purchaseRefKey) that changed
        // nothing new, so bumping the displayed count for it would drift
        // from the real server value.
        if (result.status === 'purchased') {
          setItems(prev => prev.map(i => (i.id === item.id ? { ...i, purchaseCount: i.purchaseCount + 1 } : i)));
        }
        toast({ status: 'success', title: `You got a ${item.name}!`, description: 'It\'s in your inventory below — throw it at any post or Snap.' });
      } else if (result.status === 'item_not_found') {
        toast({ status: 'error', title: 'This item is no longer available' });
      } else if (result.status === 'self_purchase') {
        toast({ status: 'warning', title: "You can't buy your own item" });
      } else {
        toast(notEnoughPointsToast(item.price));
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Purchase failed', description: err?.message });
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleClaim(item: ItemDTO) {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    setBusyItemId(item.id);
    try {
      const result = await claimOwnItem(username, item.id);
      if (result.status === 'claimed') {
        getMyInventory(username).then(setInventory);
        toast({ status: 'success', title: `You got a ${item.name}!`, description: 'Free, since it\'s yours — throw it at any post or Snap.' });
      } else {
        toast({ status: 'error', title: 'Could not claim this' });
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Claim failed', description: err?.message });
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Flex justify="space-between" align="flex-start" mb={1} gap={3}>
        <Heading size="lg" fontWeight="bold" color="text">
          The Pile
        </Heading>
        {isLoggedIn && (
          <Button as={NextLink} href="/settings/points/market/create" size="sm" leftIcon={<FiPlus />} colorScheme="blue" variant="outline" flexShrink={0}>
            Create Item
          </Button>
        )}
      </Flex>
      <Text color="overlay.500" fontSize="sm" mb={1}>
        Buy silly things with points, then throw them at posts and Snaps you love (or want to mess with).
      </Text>
      {isLoggedIn && (
        <Text color="overlay.400" fontSize="xs" mb={6}>
          Current balance: {points ? points.balance.toLocaleString() : '—'} points
        </Text>
      )}
      {!isLoggedIn && <Box mb={6} />}

      <HStack spacing={2} mb={4}>
        <Button size="xs" variant={sort === 'hot' ? 'solid' : 'outline'} colorScheme="blue" onClick={() => setSort('hot')}>
          🔥 Hot
        </Button>
        <Button size="xs" variant={sort === 'new' ? 'solid' : 'outline'} colorScheme="blue" onClick={() => setSort('new')}>
          ✨ New
        </Button>
      </HStack>

      {items.length === 0 ? (
        <Text color="overlay.400" fontSize="sm">Nothing in the shop yet — check back soon.</Text>
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
            {items.map(item => {
              const isBusy = busyItemId === item.id;
              const canAfford = !!points && points.balance >= item.price;
              const isOwnItem = isLoggedIn && username === item.creatorUsername;

              return (
                <Box
                  key={item.id}
                  bg="surface"
                  borderRadius="16px"
                  border="1px solid"
                  borderColor="surfaceBorder"
                  backdropFilter="blur(18px)"
                  p={5}
                  textAlign="center"
                >
                  <Flex justify="center" mb={3}>
                    <Image src={item.imageUrl} alt={item.name} boxSize="72px" objectFit="contain" />
                  </Flex>
                  <Text fontWeight="bold" color="text" mb={1}>{item.name}</Text>
                  <Text fontSize="xs" color="overlay.400" mb={2} noOfLines={2}>{item.description}</Text>
                  <Text fontSize="xs" color="overlay.400" mb={1}>
                    by @{item.creatorUsername}{item.purchaseCount > 0 ? ` · ${item.purchaseCount.toLocaleString()} sold` : ''}
                  </Text>
                  <Text fontSize="sm" color="overlay.400" mb={4}>
                    {item.price.toLocaleString()} points
                  </Text>
                  <Button
                    size="sm"
                    width="100%"
                    colorScheme="blue"
                    onClick={() => (isOwnItem ? handleClaim(item) : handleBuy(item))}
                    isLoading={isBusy}
                    isDisabled={!isOwnItem && isLoggedIn && !canAfford}
                  >
                    {!isLoggedIn ? 'Log in to buy' : isOwnItem ? 'Claim (free — your item)' : canAfford ? 'Buy' : 'Not enough points'}
                  </Button>
                </Box>
              );
            })}
          </SimpleGrid>
          {hasMore && (
            <Button onClick={loadMore} isLoading={loadingMore} variant="ghost" w="full" mt={4} colorScheme="blue">
              Load More
            </Button>
          )}
        </>
      )}

      {isLoggedIn && (
        <>
          <Divider borderColor="surfaceBorder" my={8} />
          <Heading size="md" fontWeight="bold" color="text" mb={1}>
            My Inventory
          </Heading>
          <Text color="overlay.500" fontSize="sm" mb={4}>
            Owned items, ready to throw at a post or Snap. Look for the throw button under any post.
          </Text>
          {inventory.length === 0 ? (
            <Text color="overlay.400" fontSize="sm">Nothing yet — buy something above.</Text>
          ) : (
            <SimpleGrid columns={{ base: 2, sm: 3 }} spacing={3}>
              {inventory.map(entry => (
                <Box key={entry.item.id} bg="surface" borderRadius="12px" border="1px solid" borderColor="surfaceBorder" p={3} textAlign="center">
                  <Image src={entry.item.imageUrl} alt={entry.item.name} boxSize="48px" objectFit="contain" mx="auto" mb={2} />
                  <Text fontSize="xs" fontWeight="medium" color="text" noOfLines={1}>{entry.item.name}</Text>
                  <Text fontSize="xs" color="overlay.400">×{entry.unitIds.length}</Text>
                </Box>
              ))}
            </SimpleGrid>
          )}
        </>
      )}

      <Text fontSize="xs" color="overlay.400" mt={6}>
        Items are non-refundable. Once thrown, an item shows on that post or Snap for everyone to see — there&apos;s no taking it back.
      </Text>
    </Box>
  );
}
