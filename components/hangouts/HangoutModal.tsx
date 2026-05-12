'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalOverlay, ModalContent, ModalCloseButton, Center, Spinner, Text, VStack, Button } from '@chakra-ui/react';
import { HangoutsProvider, HangoutsRoom, useHangoutsRoom } from '@snapie/hangouts-react';
import { useAioha } from '@aioha/react-ui';
import { useHangoutsSession } from '@/hooks/useHangoutsSession';
import { useWakeLock } from '@/hooks/useWakeLock';
import '@snapie/hangouts-react/src/styles/hangouts.css';

import { IMAGE_SERVER_API_KEY } from '@/lib/env';

const API_URL = process.env.NEXT_PUBLIC_HANGOUTS_API_URL!;
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://livekit.3speak.tv';

const FALLBACK_HANGOUT_THUMBNAIL = 'https://files.peakd.com/file/peakd-hive/meno/AKDgvpgFrvsp3fEazRgb971Pm8N7NqV3TUt1dF4TUY9798tUJHfZvwHE2BZB56Y.png';

interface HangoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function prettifyRoomName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface RoomBodyProps {
  roomName: string;
  onClose: () => void;
}

function RoomBody({ roomName, onClose }: RoomBodyProps) {
  const router = useRouter();
  const { roomMeta } = useHangoutsRoom();

  const buildComposeUrl = useCallback(() => {
    const params = new URLSearchParams({
      hangout: 'true',
      title: prettifyRoomName(roomName),
    });
    const thumbnail = roomMeta?.backgroundImage || FALLBACK_HANGOUT_THUMBNAIL;
    params.set('thumbnail', thumbnail);
    return `/compose?${params.toString()}`;
  }, [roomName, roomMeta?.backgroundImage]);

  const handleAudioHandoff = useCallback((file: { blob: Blob; filename: string; duration: number; size: number }) => {
    triggerBlobDownload(file.blob, file.filename);
    router.push(buildComposeUrl());
    onClose();
  }, [router, buildComposeUrl, onClose]);

  const handleVideoHandoff = useCallback((file: { blob: Blob; filename: string; duration: number; size: number }) => {
    triggerBlobDownload(file.blob, file.filename);
    router.push(buildComposeUrl());
    onClose();
  }, [router, buildComposeUrl, onClose]);

  return (
    <div data-hh-theme="dark" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <HangoutsRoom
        roomName={roomName}
        onLeave={onClose}
        onAudioHandoff={handleAudioHandoff}
        onVideoHandoff={handleVideoHandoff}
        video
        embedded
        guestFallback
        maxHeight="78vh"
      />
    </div>
  );
}

export default function HangoutModal({ isOpen, onClose, roomName }: HangoutModalProps) {
  useWakeLock(isOpen);
  const { user } = useAioha();
  const { sessionToken, isLoading, error, retryLogin } = useHangoutsSession(user ?? null, API_URL);

  // Authenticated users must hold a session token before HangoutsProvider mounts.
  // Without it, HangoutsRoom would fire its join() before the api-client receives
  // the token and the server replies 401. Guests bypass this gate — `guestFallback`
  // on HangoutsRoom auto-joins them as listen-only via the public `/listen`
  // endpoint.
  const needsTokenWait = !!user && !sessionToken && !error;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl">
      <ModalOverlay bg="rgba(0, 0, 0, 0.6)" backdropFilter="blur(10px)" />
      <ModalContent bg="background" color="text" borderColor="border" borderWidth="2px" maxH="85vh" overflow="hidden">
        <ModalCloseButton zIndex={10} />
        {error ? (
          <Center p={8}>
            <VStack spacing={3}>
              <Text color="red.400">Failed to authenticate: {error}</Text>
              <Button variant="ghost" onClick={() => retryLogin().catch(() => {})}>Retry</Button>
            </VStack>
          </Center>
        ) : needsTokenWait || isLoading ? (
          <Center p={8}>
            <VStack spacing={3}>
              <Spinner size="lg" color="primary" />
              <Text fontSize="sm" color="primary">Authenticating with Hangouts...</Text>
            </VStack>
          </Center>
        ) : (
          <HangoutsProvider
            apiBaseUrl={API_URL}
            livekitServerUrl={LK_URL}
            sessionToken={sessionToken}
            username={user ?? undefined}
            imageServerApiKey={IMAGE_SERVER_API_KEY}
          >
            <RoomBody roomName={roomName} onClose={onClose} />
          </HangoutsProvider>
        )}
      </ModalContent>
    </Modal>
  );
}
