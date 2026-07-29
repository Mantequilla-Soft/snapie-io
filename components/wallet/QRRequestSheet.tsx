'use client';
import {
  Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent,
  DrawerHeader, DrawerOverlay, Flex, HStack, Icon, Input, Select, Text, useToast,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { FiCheckCircle, FiShare2 } from 'react-icons/fi';
import { encodeHiveTransferQR } from '@/lib/hive/qr-utils';
import { getTransactionHistory } from '@/lib/hive/client-functions';

interface QRRequestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

// How often to check for the incoming payment while this sheet is open —
// frequent enough to feel "live" for a person-to-person handoff (someone
// selling bread, waiting on their phone) without hammering the RPC node.
const POLL_INTERVAL_MS = 5000;
// Safety net so leaving this open unattended (e.g. a market stall running
// all day) doesn't poll forever — matches roughly how long someone would
// plausibly wait on a single QR before giving up or reopening it.
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export default function QRRequestSheet({ isOpen, onClose, username }: QRRequestSheetProps) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'HIVE' | 'HBD'>('HIVE');
  const [memo, setMemo] = useState('');
  const [paymentReceived, setPaymentReceived] = useState<{ from: string; amount: string } | null>(null);
  const toast = useToast();

  const amountNum = parseFloat(amount);
  const formattedAmount = Number.isFinite(amountNum) && amountNum > 0
    ? `${amountNum.toFixed(3)} ${currency}`
    : `0.000 ${currency}`;

  const qrValue = encodeHiveTransferQR(username, formattedAmount, memo);

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  // Read via refs inside the poll loop rather than as effect deps, so typing
  // in the amount/currency fields while a poll is already running doesn't
  // restart the interval (and lose the "since when" cutoff below) on every
  // keystroke — the loop always checks against whatever's currently typed.
  const expectedAmountRef = useRef<number | null>(null);
  const currencyRef = useRef(currency);
  useEffect(() => {
    expectedAmountRef.current = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;
  }, [amountNum]);
  useEffect(() => { currencyRef.current = currency; }, [currency]);

  // Polls this account's recent transfer history for a payment matching
  // what's being requested, so a merchant doesn't have to manually refresh
  // the wallet page to see whether they've been paid yet (3speak-style
  // "don't make the user do the work we can do for them" — same instinct as
  // the earlier optimistic-reply fix). Only runs while the sheet is open.
  useEffect(() => {
    if (!isOpen) return;
    setPaymentReceived(null);
    const openedAt = new Date().toISOString();
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const { transactions } = await getTransactionHistory(username, -1, 15);
        const expected = expectedAmountRef.current;
        const match = transactions.find(tx =>
          tx.type === 'transfer' &&
          tx.to === username &&
          tx.timestamp > openedAt &&
          tx.amount.endsWith(currencyRef.current) &&
          (expected === null || parseFloat(tx.amount) >= expected)
        );
        if (match && !cancelled) {
          setPaymentReceived({ from: match.from, amount: match.amount });
          toast({ status: 'success', title: `Payment received!`, description: `${match.amount} from @${match.from}`, duration: 8000, isClosable: true });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            new Notification('Payment received!', { body: `${match.amount} from @${match.from}` });
          }
          clearInterval(intervalId);
        }
      } catch {
        // Transient RPC hiccup — just try again next tick.
      }
    };

    poll();
    intervalId = setInterval(poll, POLL_INTERVAL_MS);
    const timeoutId = setTimeout(() => clearInterval(intervalId), POLL_TIMEOUT_MS);
    // Best-effort — lets a match land as an OS notification if the merchant
    // has switched tabs/apps mid-wait. Silently no-ops if denied/unsupported.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isOpen, username, toast]);

  function buildPaymentLink() {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://snapie.io';
    const params = new URLSearchParams({ pay: '1', amount: formattedAmount });
    if (memo) params.set('memo', memo);
    return `${origin}/@${username}/wallet?${params.toString()}`;
  }

  async function handleShare() {
    const url = buildPaymentLink();
    try {
      await navigator.share({
        title: `Pay @${username}`,
        text: `Send ${formattedAmount} to @${username}${memo ? ` · "${memo}"` : ''}`,
        url,
      });
    } catch { /* user dismissed */ }
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
      <DrawerOverlay />
      <DrawerContent borderTopRadius="16px" bg="muted" maxH="92dvh">
        <DrawerCloseButton />
        <DrawerHeader
          borderBottomWidth="1px"
          borderColor="border"
          fontSize="sm"
          fontWeight="bold"
          letterSpacing="wider"
        >
          REQUEST PAYMENT
        </DrawerHeader>

        <DrawerBody py={5} overflowY="auto">
          {paymentReceived ? (
            <Flex direction="column" align="center" py={10} mb={2}>
              <Icon as={FiCheckCircle} boxSize={16} color="green.400" mb={4} />
              <Text fontSize="lg" fontWeight="bold" mb={1}>Payment received!</Text>
              <Text fontSize="sm" color="overlay.500">{paymentReceived.amount} from @{paymentReceived.from}</Text>
            </Flex>
          ) : (
            <>
              {/* Live QR */}
              <Flex justify="center" mb={5}>
                <Box
                  p={4}
                  bg="white"
                  borderRadius="16px"
                  boxShadow="0 4px 28px rgba(0,0,0,0.3)"
                >
                  <QRCode value={qrValue} size={196} />
                </Box>
              </Flex>
              <Text textAlign="center" fontSize="xs" color="primary" mb={3}>
                Waiting for payment…
              </Text>
              <Text textAlign="center" fontSize="xs" color="overlay.500" mb={5}>
                Anyone with a Hive wallet can scan this to send you {formattedAmount}
              </Text>

              {/* Amount + currency row */}
              <HStack mb={3} spacing={3}>
                <Input
                  type="number"
                  placeholder="Amount (optional)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  bg="background"
                  borderColor="border"
                  borderRadius="10px"
                  min={0}
                  flex={1}
                  _focus={{ borderColor: 'primary', boxShadow: 'none' }}
                />
                <Select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'HIVE' | 'HBD')}
                  bg="background"
                  borderColor="border"
                  borderRadius="10px"
                  w="110px"
                  flexShrink={0}
                  _focus={{ borderColor: 'primary', boxShadow: 'none' }}
                >
                  <option value="HIVE">HIVE</option>
                  <option value="HBD">HBD</option>
                </Select>
              </HStack>

              {/* Memo */}
              <Input
                placeholder="Memo (optional)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                bg="background"
                borderColor="border"
                borderRadius="10px"
                mb={5}
                _focus={{ borderColor: 'primary', boxShadow: 'none' }}
              />
            </>
          )}

          {canShare && !paymentReceived && (
            <Button
              w="full"
              leftIcon={<Icon as={FiShare2} />}
              variant="outline"
              borderColor="primary"
              color="primary"
              borderRadius="10px"
              onClick={handleShare}
              _hover={{ bg: 'rgba(24,168,255,0.08)' }}
            >
              Share QR
            </Button>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
