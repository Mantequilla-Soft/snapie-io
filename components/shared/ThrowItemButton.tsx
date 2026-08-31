'use client';
import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Box,
  Image,
  Button,
  Icon,
  Link as ChakraLink,
  useToast,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { FiTarget, FiEyeOff } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { getMyInventory, throwItem } from '@/lib/points/marketClient';
import type { InventoryEntry } from '@/lib/points/marketService';
import type { ItemThrowTargetType } from '@/lib/db/models/ItemThrow';
import { notEnoughPointsToast } from '@/components/shared/NotEnoughPointsToast';

interface ThrowItemButtonProps {
  targetAuthor: string;
  targetPermlink: string;
  targetType: ItemThrowTargetType;
}

/** Opens a compact "what do you want to throw" picker over the caller's
 *  inventory, and fires the throw. PileTray on the same target picks up the
 *  result via ITEM_THROWN_EVENT — this component doesn't need to know about
 *  the tray at all. */
export default function ThrowItemButton({ targetAuthor, targetPermlink, targetType }: ThrowItemButtonProps) {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryEntry[] | null>(null);
  const [busy, setBusy] = useState<{ itemId: string; anonymous: boolean } | null>(null);

  function handleOpen() {
    if (!isLoggedIn || !username) { openLoginModal(); return; }
    setIsOpen(true);
    setInventory(null);
    getMyInventory(username).then(setInventory);
  }

  async function handleThrow(entry: InventoryEntry, anonymous: boolean) {
    if (!username) return;
    const unitId = entry.unitIds[0];
    if (!unitId) return;

    setBusy({ itemId: entry.item.id, anonymous });
    try {
      const result = await throwItem(
        username,
        unitId,
        { author: targetAuthor, permlink: targetPermlink, type: targetType },
        entry.item,
        anonymous,
      );
      if (result.status === 'thrown') {
        toast({
          status: 'success',
          title: anonymous ? `${entry.item.name} thrown anonymously!` : `${entry.item.name} thrown!`,
          description: anonymous ? `Burned ${entry.item.price.toLocaleString()} points — nobody will see it was you.` : undefined,
          duration: 3000,
        });
        setInventory(prev =>
          prev
            ? prev
                .map(e => (e.item.id === entry.item.id ? { ...e, unitIds: e.unitIds.slice(1) } : e))
                .filter(e => e.unitIds.length > 0)
            : prev,
        );
        // Close so the Pile underneath — already updated optimistically via
        // ITEM_THROWN_EVENT — is immediately visible instead of sitting
        // behind this modal.
        setIsOpen(false);
      } else if (result.status === 'insufficient_balance') {
        toast(notEnoughPointsToast(entry.item.price, 'Throwing anonymously also'));
      } else {
        toast({ status: 'error', title: 'Could not throw that — try again' });
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not throw that', description: err?.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <HStack spacing={1} cursor="pointer" color="gray.500" _hover={{ color: 'primary' }} onClick={handleOpen}>
        <Icon as={FiTarget} boxSize={4} />
        <Text fontSize="xs">Throw something</Text>
      </HStack>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="sm">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="muted" borderColor="border" borderWidth="2px">
          <ModalHeader color="primary" borderBottomWidth="1px" borderBottomColor="border">
            Throw something at this
          </ModalHeader>
          <ModalCloseButton color="primary" _hover={{ bg: 'background' }} />
          <ModalBody pb={6}>
            {inventory === null ? (
              <Box textAlign="center" py={6}>
                <Text color="accent" fontSize="sm">Loading your inventory…</Text>
              </Box>
            ) : inventory.length === 0 ? (
              <Box textAlign="center" py={6}>
                <Text color="accent" fontSize="sm" mb={2}>You don&apos;t have anything to throw yet.</Text>
                <ChakraLink as={NextLink} href="/settings/points/market" color="primary" fontSize="sm" onClick={() => setIsOpen(false)}>
                  Visit The Pile to buy something
                </ChakraLink>
              </Box>
            ) : (
              <VStack spacing={2} align="stretch">
                {inventory.map(entry => {
                  const canAffordAnon = !!points && points.balance >= entry.item.price;
                  return (
                    <Box key={entry.item.id} p={2} borderRadius="md" bg="background" borderWidth="1px" borderColor="border">
                      <HStack justify="space-between">
                        <HStack>
                          <Image src={entry.item.imageUrl} alt={entry.item.name} boxSize="36px" objectFit="contain" />
                          <Box>
                            <Text fontWeight="medium" color="text" fontSize="sm">{entry.item.name}</Text>
                            <Text fontSize="xs" color="accent">×{entry.unitIds.length}</Text>
                          </Box>
                        </HStack>
                        <HStack spacing={1}>
                          <Button
                            size="xs"
                            colorScheme="blue"
                            isLoading={busy?.itemId === entry.item.id && !busy.anonymous}
                            isDisabled={!!busy}
                            onClick={() => handleThrow(entry, false)}
                          >
                            Throw
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="purple"
                            leftIcon={<Icon as={FiEyeOff} boxSize={3} />}
                            isLoading={busy?.itemId === entry.item.id && busy.anonymous}
                            isDisabled={!!busy || !canAffordAnon}
                            title={canAffordAnon ? `Also burns ${entry.item.price.toLocaleString()} points` : `Need ${entry.item.price.toLocaleString()} points to throw anonymously`}
                            onClick={() => handleThrow(entry, true)}
                          >
                            Anon
                          </Button>
                        </HStack>
                      </HStack>
                    </Box>
                  );
                })}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
