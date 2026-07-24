'use client';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Link as ChakraLink, useToast, Code,
} from '@chakra-ui/react';
import { useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ensureSessionToken } from '@/lib/points/client';

interface HealResult {
  status: 'credited' | 'duplicate' | 'unverified' | 'out_of_range';
  pointsCredited: number;
  balance: number;
}

// Unlisted support tool — not linked from any nav. Server-side enforcement
// (ADMIN_HIVE_USERNAMES) is the real gate; this page just renders "Access
// denied" for anyone who isn't on that list. Re-runs the same
// creditPurchase() the normal Buy Points flow uses, so it's naturally safe
// to call on a txid that already succeeded.
export default function HealPurchasePage() {
  const { username, isLoggedIn } = useCurrentUser();
  const toast = useToast();

  const [targetUsername, setTargetUsername] = useState('');
  const [txid, setTxid] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [result, setResult] = useState<HealResult | null>(null);

  async function handleHeal() {
    if (!isLoggedIn || !username || !targetUsername.trim() || !txid.trim() || isBusy) return;
    setIsBusy(true);
    setResult(null);
    try {
      const token = await ensureSessionToken(username);
      if (!token) throw new Error('Could not start a session.');

      const res = await fetch('/api/admin/points/heal-purchase', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUsername.trim(), txid: txid.trim() }),
      });

      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error('Request failed.');

      const data = (await res.json()) as HealResult;
      setResult(data);
      toast({ status: data.status === 'credited' ? 'success' : 'info', title: `Result: ${data.status}` });
    } catch (err: any) {
      toast({ status: 'error', title: 'Failed', description: err?.message });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Heal a Points Purchase
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Manually re-runs purchase verification for a reported transaction ID. Safe to run on an
        already-credited txid — it will just report "duplicate".
      </Text>

      {forbidden ? (
        <Text color="red.400">Access denied.</Text>
      ) : (
        <Box bg="surface" borderRadius="16px" border="1px solid" borderColor="surfaceBorder" p={6}>
          <VStack spacing={3} align="stretch">
            <Input placeholder="Hive username" value={targetUsername} onChange={e => setTargetUsername(e.target.value)} bg="background" borderColor="surfaceBorder" isDisabled={isBusy} />
            <Input placeholder="Transaction ID" value={txid} onChange={e => setTxid(e.target.value)} bg="background" borderColor="surfaceBorder" isDisabled={isBusy} />
            <Button colorScheme="blue" onClick={handleHeal} isLoading={isBusy} isDisabled={!targetUsername.trim() || !txid.trim()}>
              Run
            </Button>
            {result && (
              <HStack fontSize="sm" color="text" pt={2}>
                <Text>Status: <Code>{result.status}</Code></Text>
                <Text>Credited: <Code>{result.pointsCredited}</Code></Text>
                <Text>New balance: <Code>{result.balance}</Code></Text>
              </HStack>
            )}
          </VStack>
        </Box>
      )}
    </Box>
  );
}
