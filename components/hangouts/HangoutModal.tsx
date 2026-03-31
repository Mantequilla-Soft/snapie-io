'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalOverlay, ModalContent, ModalCloseButton, Center, Spinner, Text, VStack, Button } from '@chakra-ui/react';
import { HangoutsProvider, HangoutsRoom, useHangoutsAuth } from '@snapie/hangouts-react';
import { useKeychain } from '@/contexts/KeychainContext';
import { useAutoHangoutLogin } from '@/hooks/useAutoHangoutLogin';
import '@snapie/hangouts-react/src/styles/hangouts.css';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

const HANGOUT_THUMBNAIL = 'https://files.peakd.com/file/peakd-hive/meno/AKDgvpgFrvsp3fEazRgb971Pm8N7NqV3TUt1dF4TUY9798tUJHfZvwHE2BZB56Y.png';

interface HangoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
}

function HangoutRoomWithAuth({ roomName, onClose }: { roomName: string; onClose: () => void }) {
  const { user } = useKeychain();
  const auth = useHangoutsAuth();
  const { retryLogin } = useAutoHangoutLogin(user, auth);
  const router = useRouter();

  const handleRecordingUploaded = useCallback((result: { permlink: string; cid: string; playUrl: string }) => {
    const params = new URLSearchParams({
      hangout: 'true',
      title: roomName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      audioUrl: result.playUrl,
      thumbnail: HANGOUT_THUMBNAIL,
    });
    router.push(`/compose?${params.toString()}`);
    onClose();
  }, [roomName, router, onClose]);

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
    <div data-hh-theme="dark" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <HangoutsRoom
        roomName={roomName}
        onLeave={onClose}
        onRecordingUploaded={handleRecordingUploaded}
        embedded
        maxHeight="78vh"
      />
    </div>
  );
}

export default function HangoutModal({ isOpen, onClose, roomName }: HangoutModalProps) {
  return (
    <HangoutsProvider apiBaseUrl={API_URL} livekitServerUrl={LK_URL}>
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" />
        <ModalContent bg="background" color="text" borderColor="border" borderWidth="2px" maxH="85vh" overflow="hidden">
          <ModalCloseButton zIndex={10} />
          <HangoutRoomWithAuth roomName={roomName} onClose={onClose} />
        </ModalContent>
      </Modal>
    </HangoutsProvider>
  );
}
