'use client';

import { Box, Button, Heading, Icon, Spinner, Text, VStack } from '@chakra-ui/react';
import { useEffect } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { FiLogIn, FiUser, FiUserPlus } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { useSnapieAuth } from '@/contexts/SnapieAuthContext';

/**
 * /profile is not an @username, so it used to match app/[username] and that
 * route returned null. The shell (nav) still rendered, and the main area was
 * empty — no profile and no sign-in prompt. Guests now get the same Log in /
 * Create account gate as /chat. A signed-in visitor is sent to /@username.
 * The modal behind Log in is the existing Google, email, and Hive wallet login.
 */
export default function ProfilePage() {
  const { isLoggedIn, username } = useCurrentUser();
  const { isLoading } = useSnapieAuth();
  const { openLoginModal } = useLoginModal();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn || !username) return;
    router.replace(`/@${username}`);
  }, [isLoggedIn, username, router]);

  if (isLoggedIn && username) {
    return <Status label="Opening your profile" />;
  }

  // Session restore is async (the usual 401 when there is no cookie). Hold
  // the main area until that settles so a returning visitor is not flashed
  // the guest gate on the way to their profile.
  if (isLoading) {
    return <Status label="Checking session" />;
  }

  return (
    <Box maxW="480px" mx="auto" px={6} py={16} textAlign="center">
      <Icon as={FiUser} boxSize={8} color="primary" mb={4} />
      <Heading as="h1" size="md" mb={2}>Sign in to view your profile</Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Log in with Google, email, or your Hive wallet to open your profile.
      </Text>
      <VStack spacing={3}>
        <Button
          w="full"
          maxW="280px"
          colorScheme="blue"
          borderRadius="12px"
          leftIcon={<Icon as={FiLogIn} />}
          onClick={openLoginModal}
        >
          Log in
        </Button>
        <Button
          w="full"
          maxW="280px"
          variant="outline"
          color="text"
          borderColor="rgba(28, 161, 241, 0.25)"
          borderRadius="12px"
          leftIcon={<Icon as={FiUserPlus} />}
          as={NextLink}
          href="/join"
        >
          Create account
        </Button>
      </VStack>
    </Box>
  );
}

function Status({ label }: { label: string }) {
  return (
    <Box maxW="480px" mx="auto" px={6} py={16} textAlign="center" role="status">
      <Spinner color="primary" mb={4} />
      <Text color="overlay.500" fontSize="sm">{label}</Text>
    </Box>
  );
}
