'use client';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Textarea, Link as ChakraLink, useToast, Code,
} from '@chakra-ui/react';
import { useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ensureSessionToken } from '@/lib/points/client';
import { MAX_ADMIN_GRANT_POINTS } from '@/lib/points/constants';

interface GrantResult {
  status: 'granted' | 'duplicate' | 'invalid_amount';
  pointsGranted: number;
  balance: number;
}

// Unlisted support tool — not linked from any nav. Server-side enforcement
// (ADMIN_HIVE_USERNAMES) is the real gate; this page just renders "Access
// denied" for anyone who isn't on that list. Balance-only credit — see
// lib/points/adminGrantService.ts for why lifetimeEarned never moves here.
export default function GrantPointsPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const toast = useToast();

  const [targetUsername, setTargetUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [result, setResult] = useState<GrantResult | null>(null);

  const parsedAmount = Number(amount);
  const isAmountValid = Number.isInteger(parsedAmount) && parsedAmount > 0 && parsedAmount <= MAX_ADMIN_GRANT_POINTS;

  async function handleGrant() {
    if (!isLoggedIn || !username || !targetUsername.trim() || !isAmountValid || isBusy) return;
    setIsBusy(true);
    setResult(null);
    try {
      const token = await ensureSessionToken(username);
      if (!token) throw new Error('Could not start a session.');

      const res = await fetch('/api/admin/points/grant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUsername.trim(),
          points: parsedAmount,
          reason: reason.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) throw new Error('Request failed.');

      const data = (await res.json()) as GrantResult;
      setResult(data);
      if (data.status === 'granted') {
        toast({ status: 'success', title: `Granted ${data.pointsGranted.toLocaleString()} points to @${targetUsername.trim()}` });
        setAmount('');
        setReason('');
      } else if (data.status === 'invalid_amount') {
        toast({ status: 'warning', title: `Amount must be between 1 and ${MAX_ADMIN_GRANT_POINTS.toLocaleString()}` });
      } else {
        toast({ status: 'info', title: 'Already granted (duplicate request)' });
      }
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
        Grant Points
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Manually credits a user&apos;s spendable balance — e.g. as a comp. This never affects
        lifetimeEarned or leaderboard rank, same as a real-money purchase. Capped at{' '}
        {MAX_ADMIN_GRANT_POINTS.toLocaleString()} points per grant.
      </Text>

      {forbidden ? (
        <Text color="red.400">Access denied.</Text>
      ) : (
        <Box bg="surface" borderRadius="16px" border="1px solid" borderColor="surfaceBorder" p={6}>
          <VStack spacing={3} align="stretch">
            <Input placeholder="Hive username" value={targetUsername} onChange={e => setTargetUsername(e.target.value)} bg="background" borderColor="surfaceBorder" isDisabled={isBusy} />
            <Input
              placeholder={`Points (1-${MAX_ADMIN_GRANT_POINTS.toLocaleString()})`}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              bg="background"
              borderColor="surfaceBorder"
              isDisabled={isBusy}
            />
            <Textarea placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} bg="background" borderColor="surfaceBorder" isDisabled={isBusy} maxLength={280} />
            <Button colorScheme="blue" onClick={handleGrant} isLoading={isBusy} isDisabled={!targetUsername.trim() || !isAmountValid}>
              Grant
            </Button>
            {result && (
              <HStack fontSize="sm" color="text" pt={2}>
                <Text>Status: <Code>{result.status}</Code></Text>
                <Text>Granted: <Code>{result.pointsGranted}</Code></Text>
                <Text>New balance: <Code>{result.balance}</Code></Text>
              </HStack>
            )}
          </VStack>
        </Box>
      )}
    </Box>
  );
}
