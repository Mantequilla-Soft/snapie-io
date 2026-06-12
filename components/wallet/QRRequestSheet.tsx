'use client';
import {
  Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent,
  DrawerHeader, DrawerOverlay, Flex, HStack, Icon, Input, Select, Text,
} from '@chakra-ui/react';
import { useState } from 'react';
import QRCode from 'react-qr-code';
import { FiShare2 } from 'react-icons/fi';
import { encodeHiveTransferQR } from '@/lib/hive/qr-utils';

interface QRRequestSheetProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
}

export default function QRRequestSheet({ isOpen, onClose, username }: QRRequestSheetProps) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'HIVE' | 'HBD'>('HIVE');
  const [memo, setMemo] = useState('');

  const amountNum = parseFloat(amount);
  const formattedAmount = Number.isFinite(amountNum) && amountNum > 0
    ? `${amountNum.toFixed(3)} ${currency}`
    : `0.000 ${currency}`;

  const qrValue = encodeHiveTransferQR(username, formattedAmount, memo);

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  async function handleShare() {
    try {
      await navigator.share({
        title: `Pay @${username}`,
        text: `Send ${formattedAmount} to @${username}${memo ? ` · "${memo}"` : ''}`,
        url: qrValue,
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

          <Text textAlign="center" fontSize="xs" color="gray.400" mb={5}>
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

          {canShare && (
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
