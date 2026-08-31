'use client';
import {
  Box, Text, VStack, HStack, Input, Button, Badge, Spinner,
  AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader, AlertDialogContent, AlertDialogOverlay,
  Link as ChakraLink, useToast, useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { getCommunityRole, setCommunityRole, HiveCommunityRole } from '@/lib/hive/client-functions';
import { SNAPIE_COMMUNITY_TAG } from '@/lib/hive/community';

const AUTHORIZED_ROLES: HiveCommunityRole[] = ['mod', 'admin', 'owner'];

export default function MuteAccountPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const toast = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [signerRole, setSignerRole] = useState<HiveCommunityRole | null>(null);
  const [signerRoleLoading, setSignerRoleLoading] = useState(true);

  const [targetUsername, setTargetUsername] = useState('');
  const [targetRole, setTargetRole] = useState<HiveCommunityRole | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [pendingAction, setPendingAction] = useState<'mute' | 'unmute' | null>(null);

  useEffect(() => {
    if (!username || !SNAPIE_COMMUNITY_TAG) { setSignerRoleLoading(false); return; }
    setSignerRoleLoading(true);
    getCommunityRole(SNAPIE_COMMUNITY_TAG, username).then(role => {
      setSignerRole(role);
      setSignerRoleLoading(false);
    });
  }, [username]);

  const isAuthorized = signerRole !== null && AUTHORIZED_ROLES.includes(signerRole);

  async function handleCheck() {
    const target = targetUsername.trim().toLowerCase();
    if (!target) return;
    setChecking(true);
    try {
      const role = await getCommunityRole(SNAPIE_COMMUNITY_TAG, target);
      setTargetRole(role);
      setCheckedFor(target);
    } finally {
      setChecking(false);
    }
  }

  function openConfirm(action: 'mute' | 'unmute') {
    setPendingAction(action);
    onOpen();
  }

  async function handleConfirm() {
    if (!pendingAction || !checkedFor) return;
    onClose();
    setBroadcasting(true);
    try {
      const role: HiveCommunityRole = pendingAction === 'mute' ? 'muted' : 'member';
      await setCommunityRole(SNAPIE_COMMUNITY_TAG, checkedFor, role);
      toast({ status: 'success', title: pendingAction === 'mute' ? `Muted @${checkedFor}` : `Unmuted @${checkedFor}` });
      const refreshed = await getCommunityRole(SNAPIE_COMMUNITY_TAG, checkedFor);
      setTargetRole(refreshed);
    } catch (err: any) {
      toast({ status: 'error', title: 'Broadcast failed', description: err?.message });
    } finally {
      setBroadcasting(false);
      setPendingAction(null);
    }
  }

  return (
    <Box maxW="480px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings/admin" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> Admin Dashboard
      </ChakraLink>

      <Text fontSize="lg" fontWeight="bold" color="text" mb={1}>Mute / Unmute Account</Text>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        A real Hive community mute for {SNAPIE_COMMUNITY_TAG || 'the Snapie community'} — a publicly visible, on-chain action, not just something hidden inside Snapie.
      </Text>

      {!isLoggedIn ? (
        <Text color="overlay.500">Log in first.</Text>
      ) : adminLoading ? (
        <Box textAlign="center" py={8}><Spinner color="primary" /></Box>
      ) : !isAdmin ? (
        <Text color="red.400">Access denied.</Text>
      ) : (
        <VStack spacing={5} align="stretch">
          {signerRoleLoading ? (
            <HStack><Spinner size="sm" /><Text fontSize="sm" color="overlay.400">Checking your community role…</Text></HStack>
          ) : !isAuthorized ? (
            <Text color="red.400" fontSize="sm">
              @{username} doesn&apos;t hold mod/admin/owner in {SNAPIE_COMMUNITY_TAG || 'this community'} — Hive will silently ignore a role change from this account, so muting is disabled here.
            </Text>
          ) : (
            <Text color="green.400" fontSize="xs">Signed in as @{username} — role: {signerRole}</Text>
          )}

          <HStack>
            <Input
              placeholder="Hive username to check"
              value={targetUsername}
              onChange={e => setTargetUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCheck(); }}
              bg="background"
              borderColor="surfaceBorder"
              isDisabled={!isAuthorized}
            />
            <Button onClick={handleCheck} isLoading={checking} isDisabled={!isAuthorized || !targetUsername.trim()}>
              Check
            </Button>
          </HStack>

          {checkedFor && (
            <Box bg="surface" borderRadius="12px" border="1px solid" borderColor="surfaceBorder" p={4}>
              <HStack justify="space-between" mb={3}>
                <Text fontWeight="medium" color="text">@{checkedFor}</Text>
                <Badge colorScheme={targetRole === 'muted' ? 'red' : 'gray'}>{targetRole ?? 'no explicit role'}</Badge>
              </HStack>
              <HStack spacing={2}>
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  isDisabled={!isAuthorized || targetRole === 'muted'}
                  isLoading={broadcasting}
                  onClick={() => openConfirm('mute')}
                >
                  Mute
                </Button>
                <Button
                  size="sm"
                  colorScheme="green"
                  variant="outline"
                  isDisabled={!isAuthorized || targetRole !== 'muted'}
                  isLoading={broadcasting}
                  onClick={() => openConfirm('unmute')}
                >
                  Unmute
                </Button>
              </HStack>
            </Box>
          )}
        </VStack>
      )}

      <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
        <AlertDialogOverlay>
          <AlertDialogContent bg="muted" borderColor="border" borderWidth="2px">
            <AlertDialogHeader color="primary">
              {pendingAction === 'mute' ? 'Mute' : 'Unmute'} @{checkedFor}?
            </AlertDialogHeader>
            <AlertDialogBody color="text">
              This is a real, publicly visible on-chain action against {SNAPIE_COMMUNITY_TAG || 'the community'} — not a Snapie-only setting. {pendingAction === 'mute' ? 'They can be unmuted the same way, but everyone can see the change either way.' : ''}
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose} variant="ghost">Cancel</Button>
              <Button colorScheme={pendingAction === 'mute' ? 'red' : 'green'} onClick={handleConfirm} ml={3}>
                {pendingAction === 'mute' ? 'Mute' : 'Unmute'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}
