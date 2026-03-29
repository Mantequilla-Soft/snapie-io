'use client';
import { Modal, ModalOverlay, ModalContent, ModalCloseButton, Center, Spinner, Text, VStack, Button } from '@chakra-ui/react';
import { HangoutsProvider, HangoutsRoom, useHangoutsAuth } from '@snapie/hangouts-react';
import { useKeychain } from '@/contexts/KeychainContext';
import { useAutoHangoutLogin } from '@/hooks/useAutoHangoutLogin';
import '@snapie/hangouts-react/src/styles/hangouts.css';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

interface HangoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
}

function HangoutRoomWithAuth({ roomName, onClose }: { roomName: string; onClose: () => void }) {
  const { user } = useKeychain();
  const auth = useHangoutsAuth();
  const { retryLogin } = useAutoHangoutLogin(user, auth);

  if (!user) {
    return (
      <Center p={8}>
        <VStack spacing={3}>
          <Text color="primary">Log in with Hive Keychain to join hangouts</Text>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </VStack>
      </Center>
    );
  }

  if (auth.error) {
    return (
      <Center p={8}>
        <VStack spacing={3}>
          <Text color="red.400">Failed to authenticate: {auth.error}</Text>
          <Button variant="ghost" onClick={() => retryLogin().catch(() => {})}>Retry</Button>
        </VStack>
      </Center>
    );
  }

  if (auth.isLoading || !auth.isAuthenticated) {
    return (
      <Center p={8}>
        <VStack spacing={3}>
          <Spinner size="lg" color="primary" />
          <Text fontSize="sm" color="primary">Authenticating with Hangouts...</Text>
        </VStack>
      </Center>
    );
  }

  return (
    <div data-hh-theme="dark">
      <HangoutsRoom roomName={roomName} onLeave={onClose} embedded />
    </div>
  );
}

export default function HangoutModal({ isOpen, onClose, roomName }: HangoutModalProps) {
  return (
    <HangoutsProvider apiBaseUrl={API_URL} livekitServerUrl={LK_URL}>
      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
        <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" />
        <ModalContent bg="background" color="text" borderColor="border" borderWidth="2px" maxH="85vh">
          <ModalCloseButton zIndex={10} />
          <HangoutRoomWithAuth roomName={roomName} onClose={onClose} />
        </ModalContent>
      </Modal>
    </HangoutsProvider>
  );
}
