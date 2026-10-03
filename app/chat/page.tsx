'use client';

import { Box, Button, Heading, Icon, Text, VStack } from '@chakra-ui/react';
import { useEffect } from 'react';
import NextLink from 'next/link';
import { FiLogIn, FiMessageSquare, FiUserPlus } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { requestOpenChat } from '@/lib/chat/openChat';

/**
 * /chat is not a profile or post, so it used to match app/[...slug] and
 * SlugPageClient returned null. The shell (nav) still rendered, and the main
 * area was empty — no conversation UI and no sign-in prompt. Logged-out
 * visitors now get the same Log in / Create account gate as the Me sheet.
 * The modal behind Log in is the existing Google, email, and Hive wallet login.
 */
export default function ChatPage() {
  const { isLoggedIn, username } = useCurrentUser();
  const { openLoginModal } = useLoginModal();

  useEffect(() => {
    if (!isLoggedIn || !username) return;
    requestOpenChat();
  }, [isLoggedIn, username]);

  if (!isLoggedIn || !username) {
    return (
      <Box maxW="480px" mx="auto" px={6} py={16} textAlign="center">
        <Icon as={FiMessageSquare} boxSize={8} color="primary" mb={4} />
        <Heading as="h1" size="md" mb={2}>Sign in to chat</Heading>
        <Text color="overlay.500" fontSize="sm" mb={6}>
          Log in with Google, email, or your Hive wallet to join conversations.
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

  return (
    <Box maxW="480px" mx="auto" px={6} py={16} textAlign="center">
      <Icon as={FiMessageSquare} boxSize={8} color="primary" mb={4} />
      <Heading as="h1" size="md" mb={2}>Chat</Heading>
      <Text color="overlay.500" fontSize="sm" mb={6}>
        Your conversations are in the chat panel.
      </Text>
      <Button colorScheme="blue" borderRadius="12px" onClick={requestOpenChat}>
        Open chat
      </Button>
    </Box>
  );
}
