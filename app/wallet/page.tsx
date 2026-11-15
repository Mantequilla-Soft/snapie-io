'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Heading, Text, VStack } from '@chakra-ui/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';

/**
 * `/wallet` is a shortcut to the signed-in user's `/@name/wallet`. A guest,
 * or a returning user whose session has not restored yet, sees a login
 * prompt; the redirect runs as soon as a username is known.
 */
export default function WalletShortcutPage() {
  const router = useRouter();
  const { username } = useCurrentUser();
  const { openLoginModal } = useLoginModal();

  useEffect(() => {
    if (username) router.replace(`/@${username}/wallet`);
  }, [username, router]);

  return (
    <Box as="section" maxW="520px" mx="auto" px={4} py={12}>
      <VStack spacing={4} align="center" textAlign="center">
        <Heading as="h1" size="lg">Wallet</Heading>
        {username ? (
          <Text color="overlay.500" fontSize="sm">Opening your wallet…</Text>
        ) : (
          <>
            <Text color="overlay.500" fontSize="sm">
              Log in to see your HIVE, HBD and rewards.
            </Text>
            <Button colorScheme="blue" onClick={() => openLoginModal()}>
              Log in
            </Button>
          </>
        )}
      </VStack>
    </Box>
  );
}
