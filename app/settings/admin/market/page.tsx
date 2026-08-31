'use client';
import {
  Box, Heading, Text, VStack, HStack, Button, Image, Link as ChakraLink, useToast, Spinner,
} from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { ensureSessionToken } from '@/lib/points/client';
import type { ItemDTO } from '@/lib/points/marketService';

// Unlisted support tool — not linked from any nav, same shape as
// app/settings/admin/grant-points/page.tsx. Server-side enforcement
// (ADMIN_HIVE_USERNAMES) is the real gate; this page just renders "Access
// denied" for anyone who isn't on that list. Gated on useIsAdmin() the same
// way app/settings/admin/page.tsx and mute-account/page.tsx are, so a
// non-admin sees "Access denied" immediately instead of a spinner while a
// doomed request round-trips — the 403 handling below stays as a backstop
// in case the hook's cached result is ever stale.
export default function AdminMarketReviewPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [items, setItems] = useState<ItemDTO[]>([]);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!username || !isAdmin) return;
    setLoading(true);
    try {
      const token = await ensureSessionToken(username);
      if (!token) throw new Error('Could not start a session.');
      const res = await fetch('/api/admin/points/market/items', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error('Request failed.');
      const data = (await res.json()) as { items: ItemDTO[] };
      setItems(data.items ?? []);
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not load the review queue', description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [username, isAdmin, toast]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function handleDecision(item: ItemDTO, decision: 'approve' | 'reject') {
    if (!username) return;
    setBusyItemId(item.id);
    try {
      const token = await ensureSessionToken(username);
      if (!token) throw new Error('Could not start a session.');
      const res = await fetch(`/api/admin/points/market/items/${item.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error('Request failed.');
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast({ status: 'success', title: decision === 'approve' ? `Approved "${item.name}"` : `Rejected "${item.name}"` });
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not update this item', description: err?.message });
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        The Pile — Review Queue
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Approve or reject items submitted for the market. Rejecting does not refund the creator&apos;s submission fee.
      </Text>

      {!isLoggedIn ? (
        <Text color="overlay.500">Log in first.</Text>
      ) : adminLoading ? (
        <Box textAlign="center" py={8}><Spinner color="primary" /></Box>
      ) : !isAdmin || forbidden ? (
        <Text color="red.400">Access denied.</Text>
      ) : loading ? (
        <Box textAlign="center" py={8}><Spinner color="primary" /></Box>
      ) : items.length === 0 ? (
        <Text color="overlay.400" fontSize="sm">Nothing pending review.</Text>
      ) : (
        <VStack spacing={3} align="stretch">
          {items.map(item => {
            const isBusy = busyItemId === item.id;
            return (
              <HStack key={item.id} bg="surface" borderRadius="12px" border="1px solid" borderColor="surfaceBorder" p={4} align="flex-start" spacing={4}>
                <Image src={item.imageUrl} alt={item.name} boxSize="56px" objectFit="contain" flexShrink={0} />
                <Box flex={1}>
                  <Text fontWeight="bold" color="text">{item.name}</Text>
                  <Text fontSize="xs" color="overlay.400" mb={1}>by @{item.creatorUsername} · {item.price.toLocaleString()} points</Text>
                  <Text fontSize="sm" color="overlay.500">{item.description}</Text>
                </Box>
                <VStack spacing={2} flexShrink={0}>
                  <Button size="xs" colorScheme="green" isLoading={isBusy} onClick={() => handleDecision(item, 'approve')}>Approve</Button>
                  <Button size="xs" colorScheme="red" variant="outline" isLoading={isBusy} onClick={() => handleDecision(item, 'reject')}>Reject</Button>
                </VStack>
              </HStack>
            );
          })}
        </VStack>
      )}
    </Box>
  );
}
