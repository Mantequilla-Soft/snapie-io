'use client';
import {
  Box, Heading, Text, Flex, VStack, HStack, Button, Input, Link as ChakraLink, useToast,
} from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft, FiAward, FiAlertTriangle } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { transferWithKeychain } from '@/lib/hive/client-functions';
import {
  verifyPointsPurchase, recordPendingPurchase, resumePendingPurchase, getPendingPurchaseTxid,
} from '@/lib/points/client';
import {
  POINTS_PER_HBD, MIN_PURCHASE_HBD, MAX_PURCHASE_HBD, PURCHASE_PRESETS_HBD,
  POINTS_RECEIVING_ACCOUNT, hbdToPoints,
} from '@/lib/points/purchaseConfig';

const PURCHASE_MEMO = 'Snapie Points purchase';

export default function BuyPointsPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();

  const [selectedPreset, setSelectedPreset] = useState<number | null>(PURCHASE_PRESETS_HBD[0]);
  const [customAmount, setCustomAmount] = useState('');
  const [stage, setStage] = useState<'idle' | 'broadcasting' | 'verifying'>('idle');
  const [pendingTxid, setPendingTxid] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  const hbdAmount = customAmount ? parseFloat(customAmount) : selectedPreset ?? 0;
  const isValidAmount = Number.isFinite(hbdAmount) && hbdAmount >= MIN_PURCHASE_HBD && hbdAmount <= MAX_PURCHASE_HBD;
  const pointsPreview = useMemo(() => (isValidAmount ? hbdToPoints(hbdAmount) : 0), [isValidAmount, hbdAmount]);
  const isBusy = stage !== 'idle';

  // Resumes a purchase that broadcast successfully on a previous page load
  // but never finished verifying (tab closed, network dropped, etc. right
  // after real HBD left the wallet). Runs once per username.
  useEffect(() => {
    if (!username) return;
    const existing = getPendingPurchaseTxid(username);
    if (!existing) return;

    setPendingTxid(existing);
    setIsResuming(true);
    resumePendingPurchase(username)
      .then(result => {
        if (!result) return; // still unresolved, or resume wasn't attempted (rate-limited/aged out)
        if (result.status === 'credited') {
          toast({ status: 'success', title: `+${result.pointsCredited.toLocaleString()} points!`, description: `A pending purchase was confirmed. New balance: ${result.balance.toLocaleString()} points.` });
        } else if (result.status === 'duplicate') {
          toast({ status: 'info', title: 'Already credited', description: 'That pending transfer was already applied to your balance.' });
        }
        setPendingTxid(getPendingPurchaseTxid(username));
      })
      .finally(() => setIsResuming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function pickPreset(hbd: number) {
    setSelectedPreset(hbd);
    setCustomAmount('');
  }

  async function handleBuy() {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    if (!isValidAmount || isBusy) return;

    setStage('broadcasting');
    try {
      const transferRes = await transferWithKeychain(username, POINTS_RECEIVING_ACCOUNT, hbdAmount.toFixed(3), PURCHASE_MEMO, 'HBD');
      if (!transferRes || !('success' in transferRes) || !transferRes.success || !transferRes.result) {
        throw new Error('error' in (transferRes ?? {}) ? String((transferRes as any).error) : 'Transfer failed. Please try again.');
      }
      const txid = transferRes.result as string;

      // Persisted BEFORE verification so a crash/close between here and the
      // result below still leaves a record we can resume from on next load.
      recordPendingPurchase(username, txid);
      setPendingTxid(txid);

      setStage('verifying');
      const verifyRes = await verifyPointsPurchase(username, txid);

      if (verifyRes.status === 'credited') {
        toast({ status: 'success', title: `+${verifyRes.pointsCredited.toLocaleString()} points!`, description: `New balance: ${verifyRes.balance.toLocaleString()} points.` });
        setCustomAmount('');
        setPendingTxid(null);
      } else if (verifyRes.status === 'duplicate') {
        toast({ status: 'info', title: 'Already credited', description: 'This transfer was already applied to your balance.' });
        setPendingTxid(null);
      } else if (verifyRes.status === 'out_of_range') {
        toast({ status: 'warning', title: 'Amount out of range', description: `Purchases must be between ${MIN_PURCHASE_HBD} and ${MAX_PURCHASE_HBD} HBD.` });
        setPendingTxid(null);
      } else {
        toast({ status: 'error', title: 'Could not verify the transfer', description: 'We\'ll keep trying automatically. If it never confirms, contact support with your transaction ID.' });
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Purchase failed', description: err?.message });
    } finally {
      setStage('idle');
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Settings
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Buy Points
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={1}>
        {POINTS_PER_HBD} points per HBD. Paid via a normal Hive transfer — you'll be asked to approve it.
      </Text>
      {isLoggedIn && (
        <Text color="overlay.400" fontSize="xs" mb={6}>
          Current balance: {points ? points.balance.toLocaleString() : '—'} points
        </Text>
      )}
      {!isLoggedIn && <Box mb={6} />}

      {pendingTxid && (
        <Flex align="center" gap={2} bg="rgba(237, 137, 54, 0.08)" border="1px solid rgba(237, 137, 54, 0.3)" borderRadius="10px" px={4} py={3} mb={4}>
          <FiAlertTriangle color="#ed8936" />
          <Box fontSize="xs" color="text">
            {isResuming
              ? "Finishing a purchase from earlier — confirming your transfer…"
              : <>
                  We couldn't confirm a recent transfer yet (txid: <Text as="span" fontFamily="mono">{pendingTxid}</Text>).
                  We'll keep retrying automatically. If HBD left your wallet and this doesn't clear, contact support with that transaction ID.
                </>
            }
          </Box>
        </Flex>
      )}

      <Box
        bg="surface"
        borderRadius="16px"
        border="1px solid"
        borderColor="surfaceBorder"
        backdropFilter="blur(18px)"
        p={6}
      >
        <Text fontSize="xs" fontWeight="bold" color="overlay.400" letterSpacing="widest" textTransform="uppercase" mb={3}>
          Amount (HBD)
        </Text>
        <HStack spacing={2} mb={4} wrap="wrap">
          {PURCHASE_PRESETS_HBD.map(hbd => (
            <Button
              key={hbd}
              size="sm"
              variant={selectedPreset === hbd && !customAmount ? 'solid' : 'outline'}
              colorScheme={selectedPreset === hbd && !customAmount ? 'blue' : 'gray'}
              onClick={() => pickPreset(hbd)}
              isDisabled={isBusy}
            >
              {hbd} HBD
            </Button>
          ))}
        </HStack>

        <Input
          placeholder={`Custom amount (${MIN_PURCHASE_HBD}–${MAX_PURCHASE_HBD} HBD)`}
          value={customAmount}
          onChange={(e) => { setCustomAmount(e.target.value); setSelectedPreset(null); }}
          bg="background"
          borderColor="surfaceBorder"
          type="number"
          min={MIN_PURCHASE_HBD}
          max={MAX_PURCHASE_HBD}
          isDisabled={isBusy}
          mb={4}
        />

        <Flex align="center" justify="space-between" bg="rgba(28, 161, 241, 0.06)" borderRadius="10px" px={4} py={3} mb={5}>
          <HStack spacing={2}>
            <FiAward color="var(--chakra-colors-primary)" />
            <Text fontSize="sm" color="text">You'll receive</Text>
          </HStack>
          <Text fontSize="lg" fontWeight="bold" color="text">
            {isValidAmount ? pointsPreview.toLocaleString() : '—'} points
          </Text>
        </Flex>

        <Button
          colorScheme="blue"
          width="100%"
          onClick={handleBuy}
          isDisabled={!isValidAmount && isLoggedIn}
          isLoading={isBusy}
          loadingText={stage === 'broadcasting' ? 'Waiting for approval…' : 'Verifying…'}
        >
          {isLoggedIn ? `Buy ${isValidAmount ? pointsPreview.toLocaleString() : ''} Points` : 'Log in to buy points'}
        </Button>

        <Text fontSize="xs" color="overlay.400" mt={4}>
          Hive transfers can't be reversed — double-check the amount before confirming.
          Points are non-refundable and can only be spent inside Snapie.
        </Text>
      </Box>
    </Box>
  );
}
