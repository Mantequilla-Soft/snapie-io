'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalOverlay, ModalContent, ModalCloseButton, Center, Spinner, Text, VStack, Button } from '@chakra-ui/react';
import { HangoutsProvider, HangoutsRoom, useHangoutsAuth } from '@snapie/hangouts-react';
import { useAioha } from '@aioha/react-ui';
import { useHangoutsSession } from '@/hooks/useHangoutsSession';
import { useWakeLock } from '@/hooks/useWakeLock';
import '@snapie/hangouts-react/src/styles/hangouts.css';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

const HANGOUT_THUMBNAIL = 'https://files.peakd.com/file/peakd-hive/meno/AKDgvpgFrvsp3fEazRgb971Pm8N7NqV3TUt1dF4TUY9798tUJHfZvwHE2BZB56Y.png';

interface HangoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
}

interface HangoutRoomProps {
  roomName: string;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  retryLogin: () => Promise<void>;
}

function HangoutRoomWithAuth({
  roomName,
  onClose,
  isLoading,
  error,
  retryLogin,
}: HangoutRoomProps) {
  // Read the provider's authoritative auth state — flips to true only after
  // the HangoutsProvider's useEffect has pushed our session token onto its
  // internal api-client. Gating on `sessionToken` alone could mount
  // <HangoutsRoom> on the same render the token prop arrives, firing
  // `room.join()` before the api-client actually holds the token → 401.
  const sdkAuth = useHangoutsAuth();
  useWakeLock(sdkAuth.isAuthenticated);
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

  if (error) {
    return (
      <Center p={8}>
        <VStack spacing={3}>
          <Text color="red.400">Failed to authenticate: {error}</Text>
          <Button variant="ghost" onClick={() => retryLogin().catch(() => {})}>Retry</Button>
        </VStack>
      </Center>
    );
  }

  if (isLoading || !sdkAuth.isAuthenticated) {
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
        video
        embedded
        maxHeight="78vh"
      />
    </div>
  );
}

export default function HangoutModal({ isOpen, onClose, roomName }: HangoutModalProps) {
  const { user } = useAioha();
  const { sessionToken, isLoading, error, retryLogin } = useHangoutsSession(user ?? null, API_URL);

  return (
    <HangoutsProvider
      apiBaseUrl={API_URL}
      livekitServerUrl={LK_URL}
      sessionToken={sessionToken}
      username={user}
    >
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" />
        <ModalContent bg="background" color="text" borderColor="border" borderWidth="2px" maxH="85vh" overflow="hidden">
          <ModalCloseButton zIndex={10} />
          {!user ? (
            <Center p={8}>
              <VStack spacing={3}>
                <Text color="primary">Log in to join hangouts</Text>
                <Button variant="ghost" onClick={onClose}>Close</Button>
              </VStack>
            </Center>
          ) : (
            <HangoutRoomWithAuth
              roomName={roomName}
              onClose={onClose}
              isLoading={isLoading}
              error={error}
              retryLogin={retryLogin}
            />
          )}
        </ModalContent>
      </Modal>
    </HangoutsProvider>
  );
}
